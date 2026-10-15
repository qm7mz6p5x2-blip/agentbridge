// ============================================================
// AgentBridge v0.3.x — 工具调用卡片渲染（DOM 结构无关版）
//
// 设计原则（用户确认）：
//  - 扫描器挂接在「工具识别/执行」前后：识别到 <tool_call> 后、执行前后触发扫描
//    （主动通道 __ds_renderToolCallsStart/Result/Finish + 被动通道 MutationObserver/定时巡检）
//  - 渲染整段内容：AI 消息块里凡是工具调用/结果（<tool_call>/<tool_response>/<task_complete>）
//    整段重建为一组可折叠的「🛠 工具调用 N 项」卡片，而不是从文本节点里揪一小段
//  - 不是给人看的原始标签/参数/结果全部收进卡片，常态折叠，点击展开查看（保留查看权力）
//  - 原始标签内嵌在卡片里（视觉隐藏，保留 textContent 供解析器使用，不影响工具执行）
//
// 关键改进（解决"不渲染"）：
//  - 不再依赖 DeepSeek 的具体类名（类名会 hash 化/改版）。改为直接遍历对话区文本节点，
//    只要文本里出现 <tool_call>/<tool_response> 就向上找到消息容器并渲染。
//  - 用跨文本节点状态机匹配完整标签，兼容标签被 Markdown 渲染拆散的情况。
// ============================================================

(function() {
  if (window.__ds_scanLoaded) return;
  window.__ds_scanLoaded = true;

  var SCAN_DEBOUNCE = 500;
  var _scanTimer = null;
  var _observer = null;

  // ── 工具图标 ──
  var TOOL_GLYPHS = {
    exec_command: '⚡', read_file: '📄', write_file: '✏️', append_file: '➕',
    list_dir: '📁', search_files: '🔍', get_file_info: 'ℹ️',
    web_search: '🌐', http_request: '🌍', git_status: '📊',
    memory_recall: '🧠', memory_search: '🧠', plan_create: '🗂',
    default: '🔧'
  };
  function glyphFor(n) { return TOOL_GLYPHS[n] || TOOL_GLYPHS.default; }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 参数提示：让每张卡片能明确区分“做了什么/操作对象是什么”
  //  - 路径类参数(path/file/dir/cwd/glob…) → 提取末尾文件名/目录段（同目录文件不再“看起来一样”）
  //  - 命令/查询/URL → 显示内容本身
  //  - 其余 → 取第一个非空参数
  var PATH_ARG_KEYS = ['path', 'file', 'dir', 'cwd', 'glob', 'src', 'dest', 'output', 'input', 'source', 'target'];
  var TEXT_ARG_KEYS = ['command', 'cmd', 'query', 'pattern', 'keyword', 'url', 'prompt', 'message', 'content', 'name', 'title', 'label'];
  function basenameTail(s) {
    var norm = String(s).replace(/\\/g, '/');
    var parts = norm.split('/').filter(function(x) { return x !== ''; });
    if (parts.length > 3 && norm.length > 36) return parts.slice(-2).join('/'); // 长路径只留末尾2段
    return parts.length ? parts[parts.length - 1] : norm;                       // 短路径显示文件名
  }
  function argsHint(args) {
    if (!args || typeof args !== 'object') return '';
    var keys = Object.keys(args);
    if (keys.length === 0) return '';
    var picked = null;
    var i, k, v;
    for (i = 0; i < PATH_ARG_KEYS.length; i++) {
      k = PATH_ARG_KEYS[i]; v = args[k];
      if (typeof v === 'string' && v !== '') { picked = { v: basenameTail(v) }; break; }
    }
    if (!picked) {
      for (i = 0; i < TEXT_ARG_KEYS.length; i++) {
        k = TEXT_ARG_KEYS[i]; v = args[k];
        if (v !== undefined && v !== null && v !== '') { picked = { v: v }; break; }
      }
    }
    if (!picked) picked = { v: args[keys[0]] };
    var s = typeof picked.v === 'string' ? picked.v
      : (typeof picked.v === 'object' ? JSON.stringify(picked.v) : String(picked.v));
    if (s.length > 60) s = s.substring(0, 60) + '…';
    var extra = keys.length - 1;
    return s + (extra > 0 ? ' · +' + extra + ' 参数' : '');
  }

  function getPlatform() {
    try {
      if (window.PlatformRegistry && window.PlatformRegistry.getCurrent) return window.PlatformRegistry.getCurrent();
    } catch(e) {}
    return null;
  }

  // ── 卡片稳定 ID（与实时卡片 tool-cards.js 一致，恢复展开状态）──
  function cardIdFor(name, args) {
    if (window.__ds_cardState && window.__ds_cardState.idFor) {
      return window.__ds_cardState.idFor(name, args);
    }
    return '';
  }
  function isCardOpen(cid) {
    if (window.__ds_cardState && window.__ds_cardState.isOpen) {
      return window.__ds_cardState.isOpen(cid);
    }
    return false;
  }
  function setCardOpen(cid, open) {
    if (window.__ds_cardState && window.__ds_cardState.setOpen) {
      window.__ds_cardState.setOpen(cid, open);
    }
  }

  // ── 构建单张卡片 HTML ──
  function buildCardHTML(entry) {
    // entry: { cid, name, args, state: 'success'|'error'|'done'|'pending', resultText, raw }
    var state = entry.state || 'done';
    var iconCls = state === 'error' ? '__ds-tc-badge--error' : state === 'pending' ? '__ds-tc-badge--running' : '__ds-tc-badge--success';
    var iconTxt = state === 'error' ? '✗ 失败' : state === 'pending' ? '调用' : '✓ 完成';
    var preCls = state === 'error' ? '__ds-tc-pre __ds-tc-pre--error' : '__ds-tc-pre __ds-tc-pre--result';
    var openAttr = entry.cid && isCardOpen(entry.cid) ? '1' : '0';

    var body = '';
    var hasArgs = entry.args && typeof entry.args === 'object' && Object.keys(entry.args).length > 0;
    if (hasArgs) {
      body += '<div class="__ds-tc-section"><div class="__ds-tc-section-title">参数</div>';
      body += '<pre class="__ds-tc-pre">' + esc(JSON.stringify(entry.args, null, 2)) + '</pre></div>';
    }
    if (entry.resultText) {
      body += '<div class="__ds-tc-section"><div class="__ds-tc-section-title">' + (state === 'error' ? '错误' : '结果') + '</div>';
      body += '<pre class="' + preCls + '">' + esc(entry.resultText) + '</pre></div>';
    }
    // 原始语句全文 — 保证内容永不丢失（即使参数解析/字段提取不完整，这里也能看到完整原文）
    if (entry.raw) {
      body += '<div class="__ds-tc-section"><div class="__ds-tc-section-title">原始语句（完整）</div>';
      body += '<pre class="__ds-tc-pre">' + esc(entry.raw) + '</pre></div>';
    }

    // 折叠状态下的内容预览（让卡片有内容可看、且各卡片能区分，点击展开看完整）
    // 优先级：结果/错误摘要 → 参数内容 → 空
    var preview = '';
    if (entry.resultText) {
      preview = entry.resultText.replace(/\s+/g, ' ').trim();
      if (preview.length > 160) preview = preview.substring(0, 160) + '…';
    } else if (hasArgs) {
      preview = argsHint(entry.args);
      if (preview.length > 160) preview = preview.substring(0, 160) + '…';
    }

    return '' +
      '<div class="__ds-tool-card-wrap" data-state="' + state + '" data-open="' + openAttr + '"' +
      (entry.cid ? ' data-cid="' + esc(entry.cid) + '"' : '') +
      (entry.name ? ' data-tool="' + esc(entry.name) + '"' : '') + '>' +
      (entry.raw ? '<span class="__ds-raw-toolcall">' + esc(entry.raw) + '</span>' : '') +
      '  <div class="__ds-tool-card">' +
      '    <div class="__ds-tool-card-head" data-role="toggle">' +
      '      <span class="__ds-tc-icon">' + glyphFor(entry.name) + '</span>' +
      '      <div class="__ds-tc-title">' +
      '        <span class="__ds-tc-name">' + esc(entry.name) + '</span>' +
      '        <span class="__ds-tc-args-hint">' + esc(argsHint(entry.args)) + '</span>' +
      '      </div>' +
      '      <span class="__ds-tc-badge ' + iconCls + '" data-role="badge">' + iconTxt + '</span>' +
      '      <span class="__ds-tc-caret">▶</span>' +
      '    </div>' +
      (preview ? '    <div class="__ds-tc-preview" data-role="toggle">' + esc(preview) + '</div>' : '') +
      '    <div class="__ds-tool-card-body">' + body + '</div>' +
      '  </div>' +
      '</div>';
  }

  // HTML 字符串 → DOM 元素
  function htmlToEl(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.firstElementChild;
  }

  // 给卡片绑定折叠（点击按 data-cid 持久化展开状态）
  function bindCardToggles(container) {
    var heads = container.querySelectorAll('[data-role="toggle"]');
    for (var k = 0; k < heads.length; k++) {
      heads[k].addEventListener('click', function() {
        var wrap = this.closest('.__ds-tool-card-wrap');
        if (!wrap) return;
        var open = wrap.getAttribute('data-open') === '1';
        var next = open ? '0' : '1';
        wrap.setAttribute('data-open', next);
        var cid = wrap.getAttribute('data-cid') || wrap.id;
        if (cid) setCardOpen(cid, next === '1');
      });
    }
  }

  // 从 response JSON 提取可读结果文本
  function responseToText(data) {
    if (!data || typeof data !== 'object') return '';
    var out = [];
    if (data.stdout) out.push(data.stdout);
    if (data.stderr) out.push('stderr: ' + data.stderr);
    if (data.content) out.push(data.content);
    if (data.error) out.push('错误: ' + (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)));
    if (data.files) out.push(data.files.join('\n'));
    if (data.results) out.push(JSON.stringify(data.results, null, 2));
    if (data.core) out.push(JSON.stringify(data.core, null, 2));
    if (data.note) out.push(data.note);
    if (out.length === 0) out.push(JSON.stringify(data, null, 2));
    return out.join('\n').substring(0, 200000); // 卡片可展开查看，放宽显示上限（原始语句区另有全文兜底）
  }

  // 任务完成卡片
  function taskCompleteCardHTML(raw) {
    return '' +
      '<div class="__ds-tool-card-wrap" data-state="success" data-open="0">' +
      (raw ? '<span class="__ds-raw-toolcall">' + esc(raw) + '</span>' : '') +
      '<div class="__ds-tool-card"><div class="__ds-tool-card-head" data-role="toggle">' +
      '<span class="__ds-tc-icon">✅</span>' +
      '<div class="__ds-tc-title"><span class="__ds-tc-name">任务完成</span><span class="__ds-tc-args-hint"></span></div>' +
      '<span class="__ds-tc-badge __ds-tc-badge--success">✓ 完成</span>' +
      '<span class="__ds-tc-caret">▶</span>' +
      '</div><div class="__ds-tool-card-body"></div></div></div>';
  }

  // ── 从单个工具标签构建卡片元素 ──
  function buildCardFromTag(tag) {
    var cardEl = null;
    if (/^<tool_call/i.test(tag)) {
      var nm = /name\s*=\s*"([^"]*)"/i.exec(tag);
      var name = nm ? nm[1] : 'tool_call';
      var args = {};
      try {
        var jm = tag.match(/\{[\s\S]*\}/);
        if (jm) args = JSON.parse(jm[0]);
      } catch(e) {}
      cardEl = htmlToEl(buildCardHTML({
        cid: 'tc-' + cardIdFor(name, args),
        name: name, args: args,
        state: 'pending', // 调用中；执行完成由 __ds_renderToolCallResult 更新徽章
        resultText: '',
        raw: tag
      }));
    } else if (/^<tool_response/i.test(tag)) {
      var stM = /status="?([^">]*)"?/i.exec(tag);
      var status = stM ? stM[1].toLowerCase() : 'ok';
      var body = tag.replace(/^<tool_response[^>]*>/i, '').replace(/<\/tool_response>\s*$/i, '').trim();
      var data = null;
      try { data = JSON.parse(body); } catch(e) {}
      var rname = (data && (data.tool || data.name)) || 'tool_response';
      var isErr = status === 'error' || (data && (data.success === false || data.error));
      cardEl = htmlToEl(buildCardHTML({
        cid: 'tc-' + cardIdFor('resp:' + rname, { raw: tag.substring(0, 120) }),
        name: rname, args: {},
        state: isErr ? 'error' : 'success',
        resultText: responseToText(data),
        raw: tag
      }));
    } else {
      cardEl = htmlToEl(taskCompleteCardHTML(tag));
    }
    return cardEl;
  }

  // 判断是否内容容器（可安全整体重建内部结构）
  function isContentContainer(el) {
    var p = getPlatform();
    var sels = (p && p.dom && p.dom.aiMessageSelectors && p.dom.aiMessageSelectors.length)
      ? p.dom.aiMessageSelectors
      : ['div.ds-assistant-message-main-content'];
    for (var i = 0; i < sels.length; i++) {
      try { if (el.matches && el.matches(sels[i])) return true; } catch(e) {}
    }
    return false;
  }

  // 该元素是否属于面板/弹窗（跳过，避免误扫我们自己的 UI）
  function isOwnUi(el) {
    if (!el) return false;
    return !!el.closest('#__ds-agent-panel, #__ds-modal-overlay, #__ds-pet-ball');
  }

  // 在文本流 [str] 中，从 searchFrom 起找下一个完整工具标签
  // 返回 { start, end }（含开闭标签），找不到返回 null
  function matchTagInStream(str, searchFrom) {
    var openM = str.substring(searchFrom).search(/<tool_call|<tool_response|<task_complete/i);
    if (openM < 0) return null;
    var start = searchFrom + openM;
    var tail = str.substring(start);
    if (/^<tool_call/i.test(tail)) {
      var ci = tail.indexOf('</tool_call>');
      if (ci < 0) return null;
      return { start: start, end: start + ci + '</tool_call>'.length };
    }
    if (/^<tool_response/i.test(tail)) {
      var ri = tail.indexOf('</tool_response>');
      if (ri < 0) return null;
      return { start: start, end: start + ri + '</tool_response>'.length };
    }
    // task_complete：自闭合或成对
    var selfM = tail.match(/^<task_complete\s*\/?>/i);
    if (selfM) return { start: start, end: start + selfM[0].length };
    var tci = tail.indexOf('</task_complete>');
    if (tci >= 0) return { start: start, end: start + tci + '</task_complete>'.length };
    return null;
  }

  // ── 折叠组（整段渲染）：把一批卡片包成「🛠 工具调用 N 项」，常态收起 ──
  function groupToolNames(cards) {
    var names = [];
    for (var i = 0; i < cards.length; i++) {
      var nm = cards[i].getAttribute('data-tool');
      if (nm && names.indexOf(nm) === -1) names.push(nm);
    }
    return names;
  }
  function buildGroup(cards) {
    var group = document.createElement('div');
    group.className = '__ds-tool-cards-batch';
    group.setAttribute('data-open', '0');
    var head = document.createElement('div');
    head.className = '__ds-tool-cards-batch__head';
    head.setAttribute('data-role', 'group-toggle');
    head.innerHTML = '<span class="__ds-tool-cards-batch__title">\u{1F6E0} 工具调用</span>' +
      '<span class="__ds-tool-cards-batch__count">' + cards.length + ' 项</span>' +
      '<span class="__ds-tool-cards-batch__names">' + esc(groupToolNames(cards).join(' · ')) + '</span>' +
      '<span class="__ds-tc-caret">\u25B6</span>';
    var body = document.createElement('div');
    body.className = '__ds-tool-cards-batch__body';
    for (var j = 0; j < cards.length; j++) body.appendChild(cards[j]);
    group.appendChild(head);
    group.appendChild(body);
    head.addEventListener('click', function() {
      var open = group.getAttribute('data-open') === '1';
      group.setAttribute('data-open', open ? '0' : '1');
    });
    return group;
  }
  function updateGroupSummary(batch) {
    var cards = batch.querySelectorAll('.__ds-tool-card-wrap');
    var countEl = batch.querySelector('.__ds-tool-cards-batch__count');
    if (countEl) countEl.textContent = cards.length + ' 项';
    var namesEl = batch.querySelector('.__ds-tool-cards-batch__names');
    if (namesEl) namesEl.textContent = esc(groupToolNames(cards).join(' · '));
  }

  // ── 主路径 A：内容容器整段重建 ──
  // 用 textContent 拼起整段（覆盖标签被拆散），整段重建为折叠组。
  // 幂等：已重建且标签数未新增时跳过；流式新增时只追加新卡片。
  function renderRebuild(el) {
    var txt = el.textContent || '';
    if (!/<tool_call|<tool_response|<task_complete/i.test(txt)) return false;

    var newTags = [];
    var m;
    var searchFrom = 0;
    while ((m = matchTagInStream(txt, searchFrom))) {
      newTags.push(txt.substring(m.start, m.end));
      searchFrom = m.end;
    }
    if (newTags.length === 0) return false;

    var batch = el.querySelector('.__ds-tool-cards-batch');
    if (batch) {
      var existingRaw = {};
      var raws = batch.querySelectorAll('.__ds-raw-toolcall');
      for (var r = 0; r < raws.length; r++) existingRaw[raws[r].textContent] = true;
      var added = false;
      var bodyEl = batch.querySelector('.__ds-tool-cards-batch__body');
      for (var k = 0; k < newTags.length; k++) {
        if (existingRaw[newTags[k]]) continue;
        var card = buildCardFromTag(newTags[k]);
        if (card) {
          bindCardToggles(card);
          bodyEl.appendChild(card);
          added = true;
        }
      }
      if (added) updateGroupSummary(batch);
      return added;
    }

    // 无组 → 整段重建
    var plainParts = [];
    var cards = [];
    var last = 0;
    searchFrom = 0;
    while ((m = matchTagInStream(txt, searchFrom))) {
      var before = txt.substring(last, m.start);
      if (before.trim()) plainParts.push(before);
      var card = buildCardFromTag(txt.substring(m.start, m.end));
      if (card) { bindCardToggles(card); cards.push(card); }
      last = m.end;
      searchFrom = m.end;
    }
    var after = txt.substring(last);
    if (after.trim()) plainParts.push(after);
    if (cards.length === 0) return false;

    el.innerHTML = '';
    if (plainParts.length) el.appendChild(document.createTextNode(plainParts.join('\n')));
    el.appendChild(buildGroup(cards));
    return true;
  }

  // ── 主路径 B：结构安全的跨节点就地替换（DOM 结构未知时兜底）──
  // 用跨文本节点状态机找到完整标签，从对应节点中移除标签文本，在标签位置插入卡片。
  // 不重建容器结构，避免破坏 DeepSeek 布局。
  function renderInPlace(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) {
      var n = walker.currentNode;
      if (n.parentElement && n.parentElement.closest('.__ds-tool-card-wrap')) continue;
      if (isOwnUi(n.parentElement)) continue;
      nodes.push(n);
    }
    if (nodes.length === 0) return false;

    var changed = false;
    // 每次替换后重新收集节点，避免游标失效；消息文本通常很小，开销可接受
    for (var pass = 0; pass < 50; pass++) {
      var spans = [];
      var total = '';
      for (var s = 0; s < nodes.length; s++) {
        var v = nodes[s].nodeValue || '';
        spans.push({ node: nodes[s], start: total.length, end: total.length + v.length });
        total += v;
      }
      if (!/<tool_call|<tool_response|<task_complete/i.test(total)) break;

      var m = matchTagInStream(total, 0);
      if (!m) break;

      // 定位覆盖 [m.start, m.end) 的节点区间
      var first = -1, last = -1;
      for (var z = 0; z < spans.length; z++) {
        if (spans[z].end > m.start && first < 0) first = z;
        if (spans[z].start < m.end) last = z;
      }
      if (first < 0 || last < 0) break;

      var fNode = spans[first].node;
      var fVal = fNode.nodeValue || '';
      fNode.nodeValue = fVal.substring(0, m.start - spans[first].start);

      var lNode = spans[last].node;
      var lVal = lNode.nodeValue || '';
      lNode.nodeValue = lVal.substring(m.end - spans[last].start);

      for (var x = first + 1; x < last; x++) spans[x].node.nodeValue = '';

      var card = buildCardFromTag(total.substring(m.start, m.end));
      if (card) {
        bindCardToggles(card);
        fNode.parentNode.insertBefore(card, fNode);
        changed = true;
      }

      // 重新收集（原数组引用仍有效，但值变了；下一轮会重建 spans）
      // 若 fNode 变成空文本节点，可顺手移除避免留空行
      if ((fNode.nodeValue || '') === '') {
        try { if (fNode.parentNode && !fNode.parentNode.closest('.__ds-tool-card-wrap')) fNode.parentNode.removeChild(fNode); } catch(e) {}
      }
    }
    return changed;
  }

  // ── 查找候选消息元素 ──
  function findMessageElements() {
    var p = getPlatform();
    var aiSels = (p && p.dom && p.dom.aiMessageSelectors && p.dom.aiMessageSelectors.length)
      ? p.dom.aiMessageSelectors
      : ['div.ds-assistant-message-main-content'];
    var out = [];
    function has(el) { return out.indexOf(el) !== -1; }

    // 1) 平台内容容器
    for (var i = 0; i < aiSels.length; i++) {
      var els = document.querySelectorAll(aiSels[i]);
      for (var j = 0; j < els.length; j++) {
        var e = els[j];
        if (has(e) || !e.isConnected) continue;
        out.push(e);
      }
    }

    // 2) DOM 结构无关兜底：任何包含工具标签文本的文本节点，向上找到合理容器
    var p2 = getPlatform();
    var userSel = (p2 && p2.dom && p2.dom.userMessageSelector) ? p2.dom.userMessageSelector : 'div.ds-message';
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      var n = walker.currentNode;
      var nv = n.nodeValue || '';
      if (!/<tool_call|<tool_response|<task_complete/i.test(nv)) continue;
      if (n.parentElement && n.parentElement.closest('.__ds-tool-card-wrap')) continue;
      if (isOwnUi(n.parentElement)) continue;
      // 向上找容器：AI 内容容器 或 用户消息容器 都停；找不到退回文本节点直接父元素
      var el = n.parentElement;
      var stop = null;
      for (var d = 0; el && el !== document.body && d < 8; d++) {
        if (isContentContainer(el)) { stop = el; break; }
        try { if (userSel && el.matches && el.matches(userSel)) { stop = el; break; } } catch(e) {}
        el = el.parentElement;
      }
      if (!stop) stop = n.parentElement;
      if (stop && !has(stop)) {
        out.push(stop);
      }
    }
    return out;
  }

  // ── 主扫描 ──
  // 不做「已扫描」永久标记：每次重新评估，渲染函数本身幂等，避免漏扫/误标记
  function scan() {
    if (!document.body) return;
    var els = findMessageElements();
    var rendered = 0;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      try {
        var done = isContentContainer(el) ? renderRebuild(el) : renderInPlace(el);
        if (done) rendered++;
      } catch(e) { console.warn('[DS] scan render failed:', e); }
    }
    if (rendered > 0) console.log('[DS] 已渲染 ' + rendered + ' 处工具卡片');
  }

  function scheduleScan() {
    if (_scanTimer) clearTimeout(_scanTimer);
    _scanTimer = setTimeout(scan, SCAN_DEBOUNCE);
  }

  function init() {
    setTimeout(scan, 1200); // 覆盖历史消息
    try {
      _observer = new MutationObserver(function() { scheduleScan(); });
      _observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch(e) {}
    setInterval(scan, 4000); // 周期性兜底
  }

  // 供实时模块（tool-cards.js）触发一次扫描
  window.__ds_scanNow = scheduleScan;
  window.__ds_startToolScan = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================
// AgentBridge v0.2.x — 工具调用卡片渲染（就地替换版）
// 把 AI 输出的 <tool_call>/<tool_response> 文本在消息内原地替换为卡片，
// 而不是在消息后追加容器（参考 pi-web-ui：工具调用是消息内容的一部分）。
//
// 设计原则：
//  - 卡片完全由 tool-cards-scan.js 的就地替换生成（替换而非追加）
//  - 本文件只提供：卡片展开状态持久化 + 实时工具执行时的状态更新
//  - 卡片状态：调用(pending) → 完成/失败(success/error)，可折叠展开参数/结果
// ============================================================

(function() {
  // 防止重复加载
  if (window.__ds_toolCardsLoaded) return;
  window.__ds_toolCardsLoaded = true;

  // ============================================================
  // 卡片展开状态持久化（sessionStorage，页面刷新后保持）
  // 卡片 ID = hash(工具名 + 参数) → 同一调用在实时/历史渲染中 ID 一致
  // ============================================================
  var CARD_OPEN_KEY = 'dsToolCardOpenIds';
  var CARD_OPEN_MAX = 200; // 防止无限增长

  function djb2(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) & 0xffffffff;
    }
    return (h >>> 0).toString(36);
  }

  function cardIdFor(name, args) {
    var a = '';
    try { a = JSON.stringify(args || {}); } catch(e) { a = String(args); }
    return djb2(String(name) + '|' + a);
  }

  function loadOpenIds() {
    try {
      var raw = sessionStorage.getItem(CARD_OPEN_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }

  function saveOpenIds(arr) {
    try { sessionStorage.setItem(CARD_OPEN_KEY, JSON.stringify(arr)); } catch(e) {}
  }

  function isCardOpen(cid) {
    if (!cid) return false;
    return loadOpenIds().indexOf(cid) !== -1;
  }

  function setCardOpen(cid, open) {
    if (!cid) return;
    var arr = loadOpenIds();
    var idx = arr.indexOf(cid);
    if (open && idx === -1) {
      arr.push(cid);
      // LRU 截断：保留最近 CARD_OPEN_MAX 个
      if (arr.length > CARD_OPEN_MAX) arr = arr.slice(arr.length - CARD_OPEN_MAX);
    } else if (!open && idx !== -1) {
      arr.splice(idx, 1);
    } else {
      return; // 无变化
    }
    saveOpenIds(arr);
  }

  // 供扫描模块（tool-cards-scan.js）共用
  window.__ds_cardState = {
    idFor: cardIdFor,
    isOpen: isCardOpen,
    setOpen: setCardOpen
  };

  // ============================================================
  // 公开 API — 实时工具执行钩子
  // 卡片本身由 scan 就地替换生成；这里只在执行完成后更新状态徽章
  // ============================================================

  // 一轮工具调用开始 → 触发一次扫描（AI 已渲染 <tool_call> 文本则立即替换为卡片）
  window.__ds_renderToolCallsStart = function() {
    if (window.__ds_scanNow) window.__ds_scanNow();
  };

  // 单个工具调用完成 → 按稳定 ID 找到就地 call 卡片，更新状态徽章
  window.__ds_renderToolCallResult = function(toolName, args, result) {
    if (!toolName) return;
    var cid = 'tc-' + cardIdFor(toolName, args);
    var card = document.querySelector('.__ds-tool-card-wrap[data-cid="' + cid + '"]');
    if (!card) return;
    var ok = result && result.success !== false;
    card.setAttribute('data-state', ok ? 'success' : 'error');
    var badge = card.querySelector('[data-role="badge"]');
    if (badge) {
      badge.className = '__ds-tc-badge ' + (ok ? '__ds-tc-badge--success' : '__ds-tc-badge--error');
      badge.textContent = ok ? '✓ 完成' : '✗ 失败';
    }
  };

  // 一轮全部完成 → 触发扫描（处理后续 <tool_response> 文本）
  window.__ds_renderToolCallsFinish = function() {
    if (window.__ds_scanNow) window.__ds_scanNow();
  };
})();

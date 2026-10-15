// ============================================================
// AgentBridge v3.2 — Panel UI (SPOTLIGHT · Raycast-style Launcher)
// 设计语言：亮色清爽 Spotlight 启动器（参考 pi-web-ui / DeepSeek Harness）
// 布局：居中卡片 = 大搜索框 + 视图胶囊 + 分组结果列表 + 底部状态条
// Pure vanilla JS — no framework dependency
// NOTE: agentTools/agentSkills/executionHistory 在 state.js 中声明
// ============================================================

var PANEL_VERSION = '0.1.0';

var agentPersonality = null;
var agentCustomSkills = [];
var quickActions = [];
var logLevelFilter = 'all';
var autoScroll = true;
var petDragging = false;
var petOffsetX = 0;
var petOffsetY = 0;
var petDragStartX = 0;
var petDragStartY = 0;
var panelVisible = false;
var currentView = 'tools';
var searchQuery = '';
var expandedLogIndex = -1;

// ============================================================
// CSS — 已提取到 panel-css.js，此处仅调用
// ============================================================
injectPanelCSS();

// ============================================================
// HTML — Spotlight 启动器布局
// ============================================================
function injectPanelHTML() {
  if (document.getElementById('__ds-agent-panel')) return;

  // 悬浮信标（Pet ball）
  var pet = document.createElement('div');
  pet.id = '__ds-pet-ball';
  pet.innerHTML = '<span id="__ds-pet-dot"></span>\uD83E\uDD16';
  pet.title = 'AgentBridge v' + PANEL_VERSION + '\n点击: 开关面板\n拖动: 移动位置\n双击: 重置到默认位置\nCtrl+Shift+D: 快捷开关';
  pet.addEventListener('mousedown', startPetDrag);
  // 双击 pet → 重置：清除已保存面板位置，面板恢复居中
  pet.addEventListener('dblclick', function() {
    try { localStorage.removeItem('dsPanelPos'); } catch(e) {}
    pet.removeAttribute('data-moved');
    var panel = document.getElementById('__ds-agent-panel');
    if (panel && panel.classList.contains('visible')) {
      closePanel(panel, pet);
      setTimeout(function() { togglePanel(true); }, 80);
    }
    try { logPanel('info', '已重置到默认位置'); } catch(e) {}
  });
  document.body.appendChild(pet);

  // 主面板（Spotlight 卡片）
  var panel = document.createElement('div');
  panel.id = '__ds-agent-panel';
  panel.innerHTML = buildPanelHTML();
  document.body.appendChild(panel);

  // 弹窗层（快捷操作编辑 + 原始日志）
  var overlay = document.createElement('div');
  overlay.id = '__ds-modal-overlay';
  overlay.className = 'ds-modal-overlay';
  overlay.innerHTML = buildQAModalHTML() + buildRawLogsModalHTML();
  overlay.addEventListener('click', function(e) {
    if (e.target !== overlay) return;
    // 审批/确认弹窗由各自的 handler 处理，不走 hideAllModals
    var approvalModal = document.getElementById('__ds-tool-approval');
    var confirmModal = document.getElementById('__ds-confirm-modal');
    if ((approvalModal && approvalModal.style.display !== 'none') ||
        (confirmModal && confirmModal.style.display !== 'none')) {
      return;
    }
    hideAllModals();
  });
  document.body.appendChild(overlay);

  bindPanelEvents();

  // 设置平台徽章
  var platformBadge = document.getElementById('__ds-platform-badge');
  if (platformBadge) {
    var p = getPlatform();
    if (p) {
      platformBadge.textContent = p.name || p.id;
      platformBadge.title = '平台: ' + (p.name || p.id);
    } else {
      platformBadge.textContent = '?';
      platformBadge.title = '未知平台';
    }
  }

  // 恢复主题偏好
  try {
    var saved = localStorage.getItem('dsThemeMode');
    if (saved) applyTheme(saved);
    else applyTheme('system');
  } catch(e) { applyTheme('system'); }
}

// 工具分类的中文标签（用于分组标题）
var CATEGORY_LABELS = {
  system: '系统',
  io: '文件 I/O',
  custom: '自定义',
  plugin: '插件',
  mcp: 'MCP',
  tools: '工具'
};

function buildPanelHTML() {
  return [
    // ── Launcher Head：搜索 + 状态 ─────────────────────
    '<div id="__ds-launcher-head">',
    '  <div id="__ds-search-wrap">',
    '    <span id="__ds-search-icon">\u{1F50D}</span>',
    '    <input id="__ds-search" placeholder="搜索工具、命令、文件…" autocomplete="off" spellcheck="false" />',
    '    <button id="__ds-search-clear" title="清空">&times;</button>',
    '    <span id="__ds-search-kbd">Ctrl \u21E7 D</span>',
    '  </div>',
    '  <div id="__ds-launcher-bar">',
    '    <div id="__ds-status">',
    '      <span id="__ds-h-status-dot"></span>',
    '      <span id="__ds-status-text">检测中...</span>',
    '      <span id="__ds-platform-badge" title="当前 AI 平台">--</span>',
    '      <span id="__ds-sse-badge" class="ds-sse-badge" title="SSE 流拦截模式">SSE</span>',
    '    </div>',
    '    <div id="__ds-launcher-actions">',
    '      <button class="ds-hbtn" id="__ds-btn-theme" title="切换主题">&#9681;</button>',
    '      <button class="ds-hbtn" id="__ds-btn-minimize" title="最小化">&#8722;</button>',
    '      <button class="ds-hbtn ds-hbtn-close" id="__ds-btn-close" title="关闭">&times;</button>',
    '    </div>',
    '  </div>',
    '</div>',

    // ── View Pills：视图胶囊 ───────────────────────────
    '<div id="__ds-launcher-nav">',
    '  <button class="ds-pill active" data-view="tools">\u2699 工具 <span class="ds-pill-count" id="__ds-pill-count-tools">0</span></button>',
    '  <button class="ds-pill" data-view="quick">\u26A1 快捷 <span class="ds-pill-count" id="__ds-pill-count-quick">0</span></button>',
    '  <button class="ds-pill" data-view="skills">\u{1F9E0} 技能 <span class="ds-pill-count" id="__ds-pill-count-skills">0</span></button>',
    '  <button class="ds-pill" data-view="files">\u{1F4C1} 文件</button>',
    '  <button class="ds-pill" data-view="logs">\u{1F4E1} 日志 <span class="ds-pill-count" id="__ds-pill-count-logs">0</span></button>',
    '</div>',

    // ── Body：分组结果 ─────────────────────────────────
    '<div id="__ds-launcher-body">',

    // 工具视图（默认）
    '  <div class="ds-view active" id="__ds-view-tools">',
    '    <div id="__ds-tools-container"><div class="ds-empty-state"><span class="ds-empty-icon">&#9881;</span><div class="ds-empty-text">加载工具中...</div><div class="ds-empty-hint">连接服务器后可加载可用工具</div></div></div>',
    '  </div>',

    // 快捷视图
    '  <div class="ds-view" id="__ds-view-quick">',
    '    <div class="ds-quick-group">快捷操作</div>',
    '    <div id="__ds-quick-btns"></div>',
    '    <div class="ds-quick-group">内置动作</div>',
    '    <div class="ds-action-row ds-action-row--primary" data-action="start" title="注入工具提示词 + 导入记忆，一条消息完成启动">',
    '      <span class="ds-action-icon">\u{1F680}</span>',
    '      <div class="ds-action-info"><div class="ds-action-name">一键启动（工具+记忆）</div><div class="ds-action-desc">注入工具提示词并导入工作区记忆</div></div>',
    '    </div>',
    '    <div class="ds-action-row" data-action="init" title="从记忆恢复你的画像偏好；首次使用则引导设置">',
    '      <span class="ds-action-icon">\u{1F9E0}</span>',
    '      <div class="ds-action-info"><div class="ds-action-name">恢复画像</div><div class="ds-action-desc">从记忆加载你的偏好设置</div></div>',
    '    </div>',
    '    <div class="ds-action-row" data-action="retry" title="让 AI 重试上一次失败的工具调用">',
    '      <span class="ds-action-icon">\u{1F504}</span>',
    '      <div class="ds-action-info"><div class="ds-action-name">工具重试</div><div class="ds-action-desc">重试上一次失败的工具调用</div></div>',
    '    </div>',
    '    <button class="ds-add-skill-btn" id="__ds-btn-edit-qa" title="编辑快捷操作">&#9998; 编辑快捷操作</button>',
    '  </div>',

    // 技能视图
    '  <div class="ds-view" id="__ds-view-skills">',
    '    <div class="ds-group-label"><span>已安装技能</span><span class="ds-group-count" id="__ds-skills-count">0</span></div>',
    '    <div id="__ds-skills-container"></div>',
    '    <button class="ds-add-skill-btn" id="__ds-btn-add-skill">+ 添加技能</button>',
    '  </div>',

    // 文件视图
    '  <div class="ds-view" id="__ds-view-files">',
    '    <div id="__ds-fe-current-path"></div>',
    '    <div id="__ds-file-tree"><div class="__ds-file-loading">等待服务器连接...</div></div>',
    '    <div id="__ds-file-preview" class="__ds-hidden">',
    '      <div class="__ds-preview-header">',
    '        <span class="__ds-preview-title" id="__ds-preview-filename"></span>',
    '        <button class="__ds-preview-close" id="__ds-btn-preview-close">&times;</button>',
    '      </div>',
    '      <pre class="__ds-preview-content" id="__ds-preview-content"></pre>',
    '    </div>',
    '  </div>',

    // 日志视图
    '  <div class="ds-view" id="__ds-view-logs">',
    '    <div id="__ds-log-tabs">',
    '      <button class="ds-log-tab active" data-level="all">All <span class="ds-tab-count">0</span></button>',
    '      <button class="ds-log-tab" data-level="info">Info <span class="ds-tab-count">0</span></button>',
    '      <button class="ds-log-tab" data-level="warn">Warn <span class="ds-tab-count">0</span></button>',
    '      <button class="ds-log-tab" data-level="error">Error <span class="ds-tab-count">0</span></button>',
    '    </div>',
    '    <div class="ds-log-toolbar">',
    '      <span class="ds-log-toolbar-hint"></span>',
    '      <div style="display:flex;gap:6px;">',
    '        <button class="ds-log-tb-btn" id="__ds-btn-log-more" title="查看原始日志">&#8943; 原始</button>',
    '        <button class="ds-log-tb-btn" id="__ds-btn-export">导出</button>',
    '        <button class="ds-log-tb-btn" id="__ds-btn-clear">清空</button>',
    '      </div>',
    '    </div>',
    '    <div id="__ds-log-area"><div class="ds-empty-state"><span class="ds-empty-icon">&#128240;</span><div class="ds-empty-text">暂无日志</div><div class="ds-empty-hint">Agent 活动将在此实时显示</div></div></div>',
    '    <div class="ds-log-footer">',
    '      <div class="ds-log-count-bar" id="__ds-log-count-bar"></div>',
    '      <span id="__ds-chain-dots"></span>',
    '      <span id="__ds-progress-indicator"></span>',
    '      <div class="ds-log-scroll-btn active" id="__ds-btn-autoscroll">&#8964; auto-scroll</div>',
    '    </div>',
    '  </div>',

    '</div>',

    // ── Footer：状态条 ─────────────────────────────────
    '<div id="__ds-launcher-foot">',
    '  <div id="__ds-foot-left">',
    '    <span id="__ds-panel-status-dot"></span>',
    '    <span id="__ds-server-text">未连接</span>',
    '    <span id="__ds-server-status-text"></span>',
    '  </div>',
    '  <div id="__ds-foot-right">',
    '    <span id="__ds-session-text">空闲</span>',
    '    <span class="__ds-status-sep">&middot;</span>',
    '    <span id="__ds-stage-text"></span>',
    '    <span class="__ds-status-sep">&middot;</span>',
    '    <span id="__ds-agent-status-text"><span class="ds-online">Offline</span></span>',
    '  </div>',
    '</div>',
    '<div id="__ds-toast" class="__ds-toast"></div>',
    '<div id="__ds-resize-handle" title="拖动调整大小"></div>'
  ].join('');
}

function buildQAModalHTML() {
  return [
    '<div id="__ds-qa-modal" class="ds-modal" style="display:none;">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">',
    '    <div class="ds-modal-title">编辑快捷操作 <span style="font-size:11px;color:var(--ds-text-faint);">(最多 5 项)</span></div>',
    '    <button class="ds-hbtn" id="__ds-qa-close" style="font-size:14px;">&times;</button>',
    '  </div>',
    '  <div id="__ds-qa-entries"></div>',
    '  <div class="ds-modal-actions">',
    '    <button class="ds-btn ds-btn-secondary ds-btn-sm" id="__ds-qa-cancel">取消</button>',
    '    <button class="ds-btn ds-btn-primary ds-btn-sm" id="__ds-qa-save">保存</button>',
    '  </div>',
    '</div>'
  ].join('');
}

function buildRawLogsModalHTML() {
  return [
    '<div id="__ds-rawlogs-modal" class="ds-modal" style="display:none;">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">',
    '    <div class="ds-modal-title">原始日志 <span style="font-size:11px;color:var(--ds-text-faint);">(最近 100 条)</span></div>',
    '    <button class="ds-hbtn" id="__ds-rawlogs-close" style="font-size:14px;">&times;</button>',
    '  </div>',
    '  <pre id="__ds-log-preview-area">加载中...</pre>',
    '</div>'
  ].join('');
}

// ============================================================
// Theme — 亮/暗/跟随系统 切换
// ============================================================
function applyTheme(mode) {
  var root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-ds-theme');
  else root.setAttribute('data-ds-theme', mode);
  try { localStorage.setItem('dsThemeMode', mode); } catch(e) {}
  var btn = document.getElementById('__ds-btn-theme');
  if (btn) {
    btn.textContent = mode === 'system' ? '\u25D0' : mode === 'light' ? '\u2600' : '\u263E';
    btn.title = '主题: ' + (mode === 'system' ? '跟随系统' : mode === 'light' ? '亮色' : '暗色') + ' (点击切换)';
  }
}

function cycleTheme() {
  var cur = document.documentElement.getAttribute('data-ds-theme') || '';
  var next = cur === 'light' ? 'dark' : cur === 'dark' ? 'system' : 'light';
  applyTheme(next);
  logPanel('info', '主题切换为 ' + (next === 'system' ? '跟随系统' : next === 'light' ? '亮色' : '暗色'));
}

// ============================================================
// Event bindings
// ============================================================
function bindPanelEvents() {
  // Launcher 头部按钮
  var themeBtn = document.getElementById('__ds-btn-theme');
  if (themeBtn) themeBtn.onclick = cycleTheme;
  var minBtn = document.getElementById('__ds-btn-minimize');
  if (minBtn) minBtn.onclick = function() { togglePanel(false); };
  var closeBtn = document.getElementById('__ds-btn-close');
  if (closeBtn) closeBtn.onclick = function() { togglePanel(false); };

  // 视图胶囊
  var pills = document.querySelectorAll('.ds-pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].addEventListener('click', function() {
      switchView(this.getAttribute('data-view'));
    });
  }

  // 搜索
  var searchInput = document.getElementById('__ds-search');
  var clearBtn = document.getElementById('__ds-search-clear');
  if (searchInput) {
    var _searchTimer = null;
    searchInput.addEventListener('input', function() {
      searchQuery = searchInput.value.trim();
      if (clearBtn) clearBtn.classList.toggle('show', !!searchQuery);
      if (currentView !== 'tools') switchView('tools');
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(function() { renderToolCardsFiltered(searchQuery); }, 120);
    });
  }
  if (clearBtn) clearBtn.onclick = function() {
    if (searchInput) { searchInput.value = ''; searchInput.focus(); }
    searchQuery = '';
    clearBtn.classList.remove('show');
    renderToolCardsFiltered('');
  };

  // 文件预览关闭
  var previewCloseBtn = document.getElementById('__ds-btn-preview-close');
  if (previewCloseBtn) previewCloseBtn.onclick = function() { closeFilePreview(); };

  // 日志页签
  var logTabs = document.querySelectorAll('.ds-log-tab');
  for (var k = 0; k < logTabs.length; k++) {
    logTabs[k].addEventListener('click', function() {
      var tabs = document.querySelectorAll('.ds-log-tab');
      for (var m = 0; m < tabs.length; m++) tabs[m].classList.remove('active');
      this.classList.add('active');
      logLevelFilter = this.getAttribute('data-level') || 'all';
      renderLogs();
    });
  }

  // 日志工具栏
  var exportBtn = document.getElementById('__ds-btn-export');
  if (exportBtn) exportBtn.onclick = function() { exportLogs(); };
  var clearBtnLog = document.getElementById('__ds-btn-clear');
  if (clearBtnLog) clearBtnLog.onclick = function() {
    executionHistory = []; renderLogs(); logPanel('info', '日志已清空');
  };
  var moreBtn = document.getElementById('__ds-btn-log-more');
  if (moreBtn) moreBtn.onclick = openRawLogs;

  // 自动滚动
  var asBtn = document.getElementById('__ds-btn-autoscroll');
  if (asBtn) asBtn.onclick = function() {
    autoScroll = !autoScroll;
    this.classList.toggle('active', autoScroll);
    this.innerHTML = autoScroll ? '&#8964; auto-scroll' : '&#9644; paused';
    if (autoScroll) scrollToLogBottom();
  };

  // 快捷操作编辑
  var editQABtn = document.getElementById('__ds-btn-edit-qa');
  if (editQABtn) editQABtn.onclick = function() { showQAEditor(window.__ds_quickActions || []); };

  // 内置动作（快捷视图）
  var actionRows = document.querySelectorAll('#__ds-view-quick .ds-action-row');
  for (var a = 0; a < actionRows.length; a++) {
    actionRows[a].addEventListener('click', function() {
      triggerBuiltinAction(this.getAttribute('data-action'));
    });
  }

  // 添加技能
  var addSkillBtn = document.getElementById('__ds-btn-add-skill');
  if (addSkillBtn) addSkillBtn.onclick = function() {
    logPanel('info', '技能创建：使用 AI skill-creator，或通过配置手动添加');
  };

  // QA Modal
  var qaSave = document.getElementById('__ds-qa-save');
  if (qaSave) qaSave.onclick = saveQuickActions;
  var qaCancel = document.getElementById('__ds-qa-cancel');
  if (qaCancel) qaCancel.onclick = hideAllModals;
  var qaClose = document.getElementById('__ds-qa-close');
  if (qaClose) qaClose.onclick = hideAllModals;

  // RawLogs Modal
  var rawlogsClose = document.getElementById('__ds-rawlogs-close');
  if (rawlogsClose) rawlogsClose.onclick = hideAllModals;

  // 键盘：全局开关 + 面板内导航
  document.addEventListener('keydown', onPanelKeydown);

  // 面板拖拽与调整大小
  initPanelDrag();
  initPanelResize();
}

// 面板内轻提示（Toast）—— 任何按钮操作都给出即时可见反馈，避免"点了没反应"的观感
var __ds_toastTimer = null;
function showPanelToast(message, type) {
  var el = document.getElementById('__ds-toast');
  if (!el) return;
  el.textContent = message;
  el.className = '__ds-toast' + (type ? ' __ds-toast--' + type : '') + ' show';
  if (__ds_toastTimer) clearTimeout(__ds_toastTimer);
  __ds_toastTimer = setTimeout(function() {
    el.classList.remove('show');
  }, 2600);
}

function triggerBuiltinAction(action) {
  if (action === 'start') {
    logPanel('info', '🚀 一键启动（工具+记忆）...');
    showPanelToast('正在一键启动…', 'info');
    if (window.startupAgent) window.startupAgent();
    else { logPanel('error', 'startupAgent 未加载'); showPanelToast('一键启动不可用', 'error'); }
  } else if (action === 'init') {
    logPanel('info', '🧠 检测记忆状态...');
    showPanelToast('正在检测记忆状态…', 'info');
    if (window.smartAgentAction) window.smartAgentAction();
    else { logPanel('error', 'smartAgentAction 未加载'); showPanelToast('记忆管理不可用', 'error'); }
  } else if (action === 'retry') {
    logPanel('info', '🔄 发送工具重试提示...');
    showPanelToast('正在发送工具重试提示…', 'info');
    if (window.retryToolPrompt) window.retryToolPrompt();
    else { logPanel('error', 'retryToolPrompt 未加载'); showPanelToast('工具重试不可用', 'error'); }
  }
}

// ============================================================
// Keyboard navigation
// ============================================================
function activeViewRowSelector() {
  var map = {
    tools: '.ds-tool-card',
    quick: '.ds-action-row',
    skills: '.ds-skill-row',
    files: '.__ds-file-item',
    logs: '.ds-log-entry'
  };
  return map[currentView] || null;
}

function getActiveViewRows() {
  var sel = activeViewRowSelector();
  if (!sel) return [];
  var viewEl = document.getElementById('__ds-view-' + currentView);
  return viewEl ? Array.prototype.slice.call(viewEl.querySelectorAll(sel)) : [];
}

function moveActiveRow(delta) {
  var rows = getActiveViewRows();
  if (rows.length === 0) return;
  var cur = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].classList.contains('ds-active')) { cur = i; break; }
  }
  var next = cur < 0 ? 0 : (cur + delta + rows.length) % rows.length;
  for (var j = 0; j < rows.length; j++) rows[j].classList.remove('ds-active');
  rows[next].classList.add('ds-active');
  try { rows[next].scrollIntoView({ block: 'nearest' }); } catch(e) {}
}

function activateActiveRow() {
  var rows = getActiveViewRows();
  var cur = -1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].classList.contains('ds-active')) { cur = i; break; }
  }
  if (cur < 0) {
    if (rows.length > 0) { rows[0].classList.add('ds-active'); }
    return;
  }
  var row = rows[cur];
  var v = currentView;

  if (v === 'tools') {
    // Enter 循环切换工具模式：auto → manual → off
    var wrap = row.querySelector('.ds-tool-mode');
    if (wrap) {
      var tName = row.getAttribute('data-tool');
      var curMode = wrap.getAttribute('data-mode-state') || 'off';
      var nextMode = MODE_CYCLE[(MODE_CYCLE.indexOf(curMode) + 1) % MODE_CYCLE.length];
      wrap.setAttribute('data-mode-state', nextMode);
      var icon = row.querySelector('.ds-tool-icon');
      if (icon) icon.textContent = MODE_GLYPH[nextMode];
      if (window.__ds_onToolModeChange) window.__ds_onToolModeChange(tName, nextMode);
    }
  } else if (v === 'skills' || v === 'files' || v === 'logs') {
    // 触发行本身的点击行为（切换技能 / 导航文件 / 展开日志）
    if (typeof row.click === 'function') row.click();
  } else if (v === 'quick') {
    triggerBuiltinAction(row.getAttribute('data-action'));
  }
}

function onPanelKeydown(e) {
  // 全局开关
  if (e.ctrlKey && e.shiftKey && e.key === 'D') {
    e.preventDefault();
    togglePanel();
    return;
  }
  if (!panelVisible) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    var searchInput = document.getElementById('__ds-search');
    if (searchInput && searchInput.value) {
      searchInput.value = '';
      searchQuery = '';
      var clearBtn = document.getElementById('__ds-search-clear');
      if (clearBtn) clearBtn.classList.remove('show');
      renderToolCardsFiltered('');
    } else {
      togglePanel(false);
    }
    return;
  }
  if (e.key === 'ArrowDown') { e.preventDefault(); moveActiveRow(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); moveActiveRow(-1); return; }
  if (e.key === 'Enter') {
    // 输入框内回车 = 激活选中项（Spotlight 行为）
    e.preventDefault();
    activateActiveRow();
    return;
  }
}

// ============================================================
// View switching
// ============================================================
function switchView(view) {
  currentView = view;
  var pills = document.querySelectorAll('.ds-pill');
  for (var i = 0; i < pills.length; i++) {
    pills[i].classList.toggle('active', pills[i].getAttribute('data-view') === view);
  }
  var views = document.querySelectorAll('.ds-view');
  for (var j = 0; j < views.length; j++) {
    views[j].classList.toggle('active', views[j].id === '__ds-view-' + view);
  }
  if (view === 'files') { try { if (window.loadFileBrowser) window.loadFileBrowser(); } catch(e) {} }
  if (view === 'logs') renderLogs();
  if (view === 'quick') updateQuickActionButtons(window.__ds_quickActions || []);
  if (view === 'tools') renderToolCardsFiltered(searchQuery);
  if (view === 'skills') {
    var c = document.getElementById('__ds-skills-count');
    if (c) c.textContent = String((agentSkills || []).length);
  }
}

function openRawLogs() {
  var overlay = document.getElementById('__ds-modal-overlay');
  var modal = document.getElementById('__ds-rawlogs-modal');
  if (!overlay || !modal) return;
  hideAllModals();
  overlay.classList.add('show');
  modal.style.display = 'block';
  if (window.__ds_viewRawLogs) window.__ds_viewRawLogs();
  else {
    var previewEl = document.getElementById('__ds-log-preview-area');
    if (previewEl) previewEl.textContent = '(本地日志模块未加载)';
  }
}

// ============================================================
// Pet ball drag
// ============================================================
function startPetDrag(e) {
  if (e.button !== 0) return;
  petDragging = true;
  petDragStartX = e.clientX; petDragStartY = e.clientY;
  var pet = document.getElementById('__ds-pet-ball');
  var rect = pet.getBoundingClientRect();
  petOffsetX = e.clientX - rect.left; petOffsetY = e.clientY - rect.top;
  pet.style.transition = 'none';
  document.addEventListener('mousemove', petDragMove);
  document.addEventListener('mouseup', petDragEnd);
  // 安全超时：防止 mouseup 未触发导致监听器泄漏
  var _petDragSafetyTimer = setTimeout(function() {
    document.removeEventListener('mousemove', petDragMove);
    document.removeEventListener('mouseup', petDragEnd);
    petDragging = false;
  }, 30000);
  petDragEnd._safetyTimer = _petDragSafetyTimer;
  e.preventDefault();
}
function petDragMove(e) {
  if (!petDragging) return;
  var pet = document.getElementById('__ds-pet-ball');
  var vw = window.innerWidth, vh = window.innerHeight;
  pet.style.left = Math.min(Math.max(e.clientX - petOffsetX, 0), vw - 48) + 'px';
  pet.style.right = 'auto'; pet.style.bottom = 'auto';
  pet.style.top = Math.min(Math.max(e.clientY - petOffsetY, 0), vh - 48) + 'px';
}
function petDragEnd(e) {
  if (!petDragging) return;
  petDragging = false;
  // 清除安全超时定时器
  if (petDragEnd._safetyTimer) { clearTimeout(petDragEnd._safetyTimer); petDragEnd._safetyTimer = null; }
  var dx = Math.abs(e.clientX - petDragStartX), dy = Math.abs(e.clientY - petDragStartY);
  var pet = document.getElementById('__ds-pet-ball');
  pet.style.transition = 'transform .15s';
  // 移动距离 < 5px 视为点击 → 开关面板；否则保留新位置并标记已移动
  if (dx < 5 && dy < 5) {
    togglePanel();
  } else {
    pet.setAttribute('data-moved', '1');
  }
  document.removeEventListener('mousemove', petDragMove);
  document.removeEventListener('mouseup', petDragEnd);
}

// ============================================================
// Toggle panel visibility
// ============================================================
function togglePanel(show) {
  var panel = document.getElementById('__ds-agent-panel');
  var pet = document.getElementById('__ds-pet-ball');
  if (!panel || !pet) { console.warn('[DS] togglePanel: elements not found', !!panel, !!pet); return; }

  var isOpen = panel.classList.contains('visible');

  if (show === true && !isOpen) {
    openPanel(panel, pet);
  } else if (show === false && isOpen) {
    closePanel(panel, pet);
  } else if (show === undefined) {
    if (isOpen) { closePanel(panel, pet); }
    else { openPanel(panel, pet); }
  }
}

function openPanel(panel, pet) {
  panelVisible = true;
  panel.classList.add('visible');
  var vw = window.innerWidth, vh = window.innerHeight;
  var w = panel.offsetWidth || 680;
  var h = panel.offsetHeight || 600;
  var petMoved = pet && pet.getAttribute('data-moved') === '1';
  var left = null, top = null;

  if (petMoved && pet) {
    // 用户拖动过悬浮球 → 面板出现在球附近（球即锚点）
    var pr = pet.getBoundingClientRect();
    left = Math.min(Math.max(pr.left + 6, 8), vw - w - 8);
    top = Math.min(Math.max(pr.top + 6, 8), vh - h - 8);
  } else {
    // 恢复上次面板位置（默认居中偏上）
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem('dsPanelPos') || 'null'); } catch(e) {}
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      left = Math.min(Math.max(saved.left, 8), vw - w - 8);
      top = Math.min(Math.max(saved.top, 8), vh - h - 8);
    } else {
      left = Math.max((vw - w) / 2, 8);
      top = Math.max((vh - h) / 2 - 30, 8);
    }
  }
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.transform = 'none';
  // 面板展开时隐藏机器人窗口，保持两者只出现一种
  pet.style.display = 'none';
  loadPanelData();
  // 打开时聚焦搜索框
  setTimeout(function() {
    var s = document.getElementById('__ds-search');
    if (s) { try { s.focus(); } catch(e) {} }
  }, 60);
}

function closePanel(panel, pet) {
  panelVisible = false;
  // 记录当前面板左上角位置，供下次打开复用
  try {
    localStorage.setItem('dsPanelPos', JSON.stringify({
      left: panel.offsetLeft, top: panel.offsetTop
    }));
  } catch(e) {}
  panel.classList.remove('visible');
  // 关闭时恢复机器人窗口，并把悬浮球绑定到面板左上角
  pet.style.display = '';
  var rect = panel.getBoundingClientRect();
  var vw = window.innerWidth, vh = window.innerHeight;
  var size = 52;
  var px = Math.min(Math.max(rect.left, 0), vw - size);
  var py = Math.min(Math.max(rect.top, 0), vh - size);
  pet.style.transition = 'left 0.25s var(--ds-ease-out), top 0.25s var(--ds-ease-out), right 0.25s var(--ds-ease-out), bottom 0.25s var(--ds-ease-out)';
  pet.style.left = px + 'px';
  pet.style.top = py + 'px';
  pet.style.right = 'auto';
  pet.style.bottom = 'auto';
  setTimeout(function() { pet.style.transition = 'transform 0.18s var(--ds-ease-out), box-shadow 0.3s'; }, 300);
  pet.setAttribute('data-moved', '1');
}

// ============================================================
// Panel drag — 拖拽面板移动位置
// ============================================================
var __panelDragging = false;
var __panelDragDX = 0;
var __panelDragDY = 0;

function initPanelDrag() {
  var head = document.getElementById('__ds-launcher-head');
  if (!head || head.__ds_dragBound) return;
  head.__ds_dragBound = true;

  head.addEventListener('mousedown', function(e) {
    // 排除按钮/搜索框/输入框等交互元素的拖拽
    var t = e.target;
    if (t.closest('button') || t.closest('input') || t.closest('textarea') || t.closest('select')) return;
    var panel = document.getElementById('__ds-agent-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    __panelDragging = true;
    __panelDragDX = e.clientX - panel.offsetLeft;
    __panelDragDY = e.clientY - panel.offsetTop;
    head.classList.add('ds-dragging');
    document.addEventListener('mousemove', onPanelDragMove);
    document.addEventListener('mouseup', onPanelDragEnd);
  });

  function onPanelDragMove(e) {
    if (!__panelDragging) return;
    var panel = document.getElementById('__ds-agent-panel');
    if (!panel) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var w = panel.offsetWidth, h = panel.offsetHeight;
    panel.style.left = Math.min(Math.max(e.clientX - __panelDragDX, 8), vw - w - 8) + 'px';
    panel.style.top = Math.min(Math.max(e.clientY - __panelDragDY, 8), vh - h - 8) + 'px';
    panel.style.transform = 'none';
  }
  function onPanelDragEnd() {
    __panelDragging = false;
    var head = document.getElementById('__ds-launcher-head');
    if (head) head.classList.remove('ds-dragging');
    document.removeEventListener('mousemove', onPanelDragMove);
    document.removeEventListener('mouseup', onPanelDragEnd);
  }
}

// ============================================================
// Panel resize — 右下角调整大小
// ============================================================
var __panelResizing = false;
var __resizeStartW = 0;
var __resizeStartH = 0;
var __resizeStartX = 0;
var __resizeStartY = 0;
var PANEL_MIN_W = 420;
var PANEL_MIN_H = 320;

function initPanelResize() {
  var handle = document.getElementById('__ds-resize-handle');
  if (!handle || handle.__ds_resizeBound) return;
  handle.__ds_resizeBound = true;

  handle.addEventListener('mousedown', function(e) {
    var panel = document.getElementById('__ds-agent-panel');
    if (!panel || !panel.classList.contains('visible')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    __panelResizing = true;
    __resizeStartW = panel.offsetWidth;
    __resizeStartH = panel.offsetHeight;
    __resizeStartX = e.clientX;
    __resizeStartY = e.clientY;
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  });

  function onResizeMove(e) {
    if (!__panelResizing) return;
    var panel = document.getElementById('__ds-agent-panel');
    if (!panel) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var left = panel.offsetLeft, top = panel.offsetTop;
    var maxW = vw - left - 16;
    var maxH = vh - top - 16;
    var w = Math.min(Math.max(__resizeStartW + (e.clientX - __resizeStartX), PANEL_MIN_W), maxW);
    var h = Math.min(Math.max(__resizeStartH + (e.clientY - __resizeStartY), PANEL_MIN_H), maxH);
    panel.style.width = w + 'px';
    panel.style.height = h + 'px';
  }
  function onResizeEnd() {
    __panelResizing = false;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  }
}

async function loadPanelData() {
  var serverOnline = false;
  try {
    if (window.checkServerHealth) {
      var r = await window.checkServerHealth();
      serverOnline = r && r.healthy;
      updateServerStatusUI(serverOnline);
    }
  } catch(e) {}
  if (serverOnline) {
    try { if (window.loadTools) window.loadTools(); } catch(e) {}
    try { if (window.loadSkills) window.loadSkills(); } catch(e) {}
    try { if (window.loadQuickActions) window.loadQuickActions(); } catch(e) {}
  } else {
    // 服务器不可用时，3秒后自动重试一次（可能是 CORS 或网络延迟）
    setTimeout(async function() {
      try {
        if (window.checkServerHealth) {
          var r2 = await window.checkServerHealth();
          if (r2 && r2.healthy) {
            updateServerStatusUI(true);
            if (window.loadTools) window.loadTools();
            if (window.loadSkills) window.loadSkills();
            if (window.loadQuickActions) window.loadQuickActions();
          }
        }
      } catch(e) {}
    }, 3000);
  }
  renderLogs();
}

// ============================================================
// Tool cards rendering — 分组 + 分段模式控件
// ============================================================
var MODE_CYCLE = ['auto', 'manual', 'off'];
var MODE_LABELS = { auto: 'AUTO', manual: 'MANUAL', off: 'OFF' };
var MODE_GLYPH = { auto: '\u26A1', manual: '\u25CF', off: '\u25CB' };

function updatePillCount(name, n) {
  var el = document.getElementById('__ds-pill-count-' + name);
  if (el) el.textContent = String(n || 0);
}

function renderToolsList(tools) {
  if (!tools || !Array.isArray(tools)) return;
  agentTools = tools;
  renderToolCardsFiltered(searchQuery);
}

function renderToolCardsFiltered(query) {
  var container = document.getElementById('__ds-tools-container');
  if (!container) return;
  var q = (query || '').toLowerCase();
  var filtered = agentTools.filter(function(t) {
    return !q || (t.name || '').toLowerCase().indexOf(q) >= 0 || (t.description || '').toLowerCase().indexOf(q) >= 0;
  });
  updatePillCount('tools', (agentTools || []).length);

  if (filtered.length === 0) {
    container.innerHTML = buildEmptyStateHTML(
      q ? '未找到匹配 "' + escapeAttr(q) + '" 的工具' : '暂无工具',
      q ? '尝试其他关键词' : '连接服务器以加载可用工具',
      '\u{1F50D}'
    );
    return;
  }

  // 按 category 分组，保持稳定顺序
  var groups = {};
  var order = [];
  for (var i = 0; i < filtered.length; i++) {
    var cat = filtered[i].category || 'tools';
    if (!groups[cat]) { groups[cat] = []; order.push(cat); }
    groups[cat].push(filtered[i]);
  }

  var html = '';
  var idx = 0;
  for (var g = 0; g < order.length; g++) {
    var catName = order[g];
    html += '<div class="ds-group-label">';
    html += '  <span class="ds-group-name">' + escapeAttr(CATEGORY_LABELS[catName] || catName) + '</span>';
    html += '  <span class="ds-group-count">' + groups[catName].length + '</span>';
    html += '</div>';
    var toolsInGroup = groups[catName];
    for (var t = 0; t < toolsInGroup.length; t++) {
      var tool = toolsInGroup[t];
      var mode = tool.mode || 'off';
      html += '<div class="ds-tool-card" data-tool="' + escapeAttr(tool.name) + '" style="--i:' + (idx++) + '">';
      html += '<span class="ds-tool-icon">' + (MODE_GLYPH[mode] || '\u25CB') + '</span>';
      html += '<div class="ds-tool-info">';
      html += '<div class="ds-tool-name">' + escapeAttr(tool.name) + '</div>';
      html += '<div class="ds-tool-desc">' + escapeAttr(tool.description || '') + '</div>';
      html += '</div>';
      html += '<span class="ds-tool-mode" data-mode-state="' + escapeAttr(mode) + '" data-tool="' + escapeAttr(tool.name) + '">';
      html += '<button class="ds-mode-seg" data-mode="auto">AUTO</button>';
      html += '<button class="ds-mode-seg" data-mode="manual">MAN</button>';
      html += '<button class="ds-mode-seg" data-mode="off">OFF</button>';
      html += '</span>';
      html += '</div>';
    }
  }
  container.innerHTML = html;

  // 点击卡片 → 设为键盘高亮
  var cards = container.querySelectorAll('.ds-tool-card');
  for (var c = 0; c < cards.length; c++) {
    cards[c].addEventListener('click', function() {
      var all = container.querySelectorAll('.ds-tool-card');
      for (var n = 0; n < all.length; n++) all[n].classList.remove('ds-active');
      this.classList.add('ds-active');
    });
  }

  // 分段控件点击 → 设定该模式
  var segs = container.querySelectorAll('.ds-mode-seg');
  for (var j = 0; j < segs.length; j++) {
    segs[j].onclick = (function(seg) {
      return function(e) {
        e.stopPropagation();
        var wrap = seg.closest('.ds-tool-mode');
        if (!wrap) return;
        var tName = wrap.getAttribute('data-tool');
        var mode = seg.getAttribute('data-mode');
        wrap.setAttribute('data-mode-state', mode);
        var icon = wrap.parentNode.querySelector('.ds-tool-icon');
        if (icon) icon.textContent = MODE_GLYPH[mode];
        if (window.__ds_onToolModeChange) window.__ds_onToolModeChange(tName, mode);
      };
    })(segs[j]);
  }
}

// ============================================================
// Skills rendering
// ============================================================
function renderSkillsList(skills, customSkills) {
  if (!skills) skills = [];
  if (!Array.isArray(skills)) return;
  agentSkills = skills;
  agentCustomSkills = customSkills || [];
  var container = document.getElementById('__ds-skills-container');
  var countEl = document.getElementById('__ds-skills-count');
  if (!container) return;
  if (countEl) countEl.textContent = String(skills.length);
  updatePillCount('skills', skills.length);
  if (skills.length === 0) {
    container.innerHTML = buildEmptyStateHTML('暂无技能', '通过 skill-creator 或配置添加', '\u{1F9E0}');
    return;
  }
  var html = '';
  for (var i = 0; i < skills.length; i++) {
    var sk = skills[i];
    var enabled = sk.enabled !== undefined ? sk.enabled : false;
    html += '<div class="ds-skill-row" data-skill="' + escapeAttr(sk.dirName || sk.name) + '">';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div class="ds-skill-name">' + escapeAttr(sk.name) + '</div>';
    if (sk.description) html += '<div class="ds-skill-desc">' + escapeAttr(sk.description) + '</div>';
    html += '</div>';
    html += '<div class="ds-skill-toggle" data-skill="' + escapeAttr(sk.dirName || sk.name) + '" data-enabled="' + enabled + '">';
    html += '<div class="ds-toggle-pill ' + (enabled ? 'on' : 'off') + '"><div class="ds-toggle-knob"></div></div>';
    html += '</div></div>';
  }
  container.innerHTML = html;

  var toggles = container.querySelectorAll('.ds-skill-toggle');
  for (var j = 0; j < toggles.length; j++) {
    toggles[j].onclick = (function(el) {
      return function(e) {
        e.stopPropagation();
        var sName = el.getAttribute('data-skill');
        var curEnabled = el.getAttribute('data-enabled') === 'true';
        var newEnabled = !curEnabled;
        el.setAttribute('data-enabled', String(newEnabled));
        var pill = el.querySelector('.ds-toggle-pill');
        pill.className = 'ds-toggle-pill ' + (newEnabled ? 'on' : 'off');
        if (window.__ds_toggleSkill) window.__ds_toggleSkill(sName, newEnabled);
      };
    })(toggles[j]);
  }

  // 点击整行 → 键盘高亮
  var rows = container.querySelectorAll('.ds-skill-row');
  for (var r = 0; r < rows.length; r++) {
    rows[r].addEventListener('click', function() {
      var all = container.querySelectorAll('.ds-skill-row');
      for (var n = 0; n < all.length; n++) all[n].classList.remove('ds-active');
      this.classList.add('ds-active');
    });
  }
}

// ============================================================
// Quick actions
// ============================================================
function updateQuickActionButtons(actions) {
  if (!actions) actions = [];
  window.__ds_quickActions = actions;
  quickActions = actions;
  var container = document.getElementById('__ds-quick-btns');
  if (!container) return;
  updatePillCount('quick', actions.length);
  if (actions.length === 0) {
    container.innerHTML = '<span class="ds-qbtn-empty">暂无快捷操作</span>';
    return;
  }
  var icons = ['\uD83D\uDCCB', '\uD83D\uDCDD', '\uD83D\uDDC2', '\uD83D\uDCCA', '\uD83E\uDDED'];
  var html = '';
  for (var i = 0; i < actions.length; i++) {
    html += '<button class="ds-qbtn" data-qa-index="' + i + '">';
    html += '<span class="ds-qbtn-icon">' + (icons[i % icons.length] || '\u229E') + '</span>';
    html += escapeAttr(actions[i].label || 'Action ' + (i + 1));
    html += '</button>';
  }
  container.innerHTML = html;
  var btns = container.querySelectorAll('.ds-qbtn');
  for (var j = 0; j < btns.length; j++) {
    btns[j].onclick = (function(idx) {
      return function() {
        if (window.triggerQuickAction) window.triggerQuickAction(idx);
      };
    })(parseInt(btns[j].getAttribute('data-qa-index')));
  }
  updateStatusBar();
}

function updateStatusBar() {
  var statusEl = document.getElementById('__ds-agent-status-text');
  if (!statusEl) return;
  var tools = agentTools || [];
  var autoCount = 0;
  for (var i = 0; i < tools.length; i++) {
    if ((tools[i].mode || 'off') === 'auto') autoCount++;
  }
  statusEl.innerHTML = '<span class="ds-online">Ready</span>' +
    '<span class="__ds-status-sep"> &middot; </span>' +
    '<span class="ds-tool-count">' + tools.length + '</span> tools' +
    '<span class="__ds-status-sep"> &middot; </span>' + autoCount + ' auto';
}

// ============================================================
// Agent state
// ============================================================
function updateAgentPanelUI(initialized) {
  updateStatusBar();
  updateQuickActionButtons(window.__ds_quickActions || []);
}

// ============================================================
// Logs
// ============================================================
function renderLogs() {
  var area = document.getElementById('__ds-log-area');
  if (!area) return;
  var recent = (executionHistory || []).slice(-200);
  var filtered = recent;
  if (logLevelFilter && logLevelFilter !== 'all') {
    filtered = recent.filter(function(l) { return l.level === logLevelFilter; });
  }
  updateLogTabCounts(recent);
  updatePillCount('logs', (executionHistory || []).length);

  if (filtered.length === 0) {
    area.innerHTML = buildEmptyStateHTML(
      (executionHistory && executionHistory.length === 0) ? '暂无日志' : '没有 ' + logLevelFilter + ' 级别的日志',
      (executionHistory && executionHistory.length === 0) ? 'Agent 活动将在此实时显示' : '切换到其他过滤级别',
      '\u{1F4E1}'
    );
    updateLogFooter(recent);
    return;
  }
  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var log = filtered[i];
    var cls = 'ds-badge-' + (log.level === 'error' ? 'error' : log.level === 'warn' ? 'warn' : log.level === 'success' ? 'success' : 'info');
    var logIndex = executionHistory.indexOf(log);
    var isExpanded = logIndex === expandedLogIndex;
    html += '<div class="ds-log-entry' + (isExpanded ? ' ds-log-expanded' : '') + '" data-log-index="' + logIndex + '">';
    html += '<span class="ds-log-time">' + escapeAttr(log.time || '--:--') + '</span>';
    html += '<span class="ds-log-badge ' + cls + '">' + (log.level || 'info') + '</span>';
    html += '<span class="ds-log-msg">' + escapeAttr(log.message || '') + '</span>';
    if (isExpanded && log.detail) {
      html += '<div class="ds-log-detail">' + escapeAttr(log.detail) + '</div>';
    }
    html += '</div>';
  }
  area.innerHTML = html;

  // 事件委托：展开/收起 + 键盘高亮
  if (!area._dsLogDelegated) {
    area._dsLogDelegated = true;
    area.addEventListener('click', function(e) {
      var logEl = e.target.closest('.ds-log-entry');
      if (logEl) {
        var idx = parseInt(logEl.getAttribute('data-log-index'));
        expandedLogIndex = expandedLogIndex === idx ? -1 : idx;
        // 键盘高亮
        var all = area.querySelectorAll('.ds-log-entry');
        for (var n = 0; n < all.length; n++) all[n].classList.remove('ds-active');
        logEl.classList.add('ds-active');
        renderLogs();
      }
    });
  }

  updateLogFooter(recent);
  if (autoScroll) scrollToLogBottom();
}

// 更新日志页签计数（All/Info/Warn/Error）
function updateLogTabCounts(recent) {
  var counts = { all: recent.length, info: 0, warn: 0, error: 0, success: 0 };
  for (var i = 0; i < recent.length; i++) {
    var lv = recent[i].level;
    if (counts.hasOwnProperty(lv)) counts[lv]++;
  }
  var tabs = document.querySelectorAll('#__ds-log-tabs .ds-log-tab');
  for (var j = 0; j < tabs.length; j++) {
    var lv = tabs[j].getAttribute('data-level');
    var span = tabs[j].querySelector('.ds-tab-count');
    if (!span) continue;
    var n = lv === 'all' ? counts.all : lv === 'info' ? counts.info + counts.success : counts[lv] || 0;
    span.textContent = String(n);
  }
}

// 更新日志底部计数栏
function updateLogFooter(recent) {
  var bar = document.getElementById('__ds-log-count-bar');
  if (!bar) return;
  var counts = { info: 0, warn: 0, error: 0, success: 0 };
  for (var i = 0; i < recent.length; i++) {
    if (counts.hasOwnProperty(recent[i].level)) counts[recent[i].level]++;
  }
  var html = '<span class="ds-log-count">' + recent.length + ' entries</span>';
  if (counts.error > 0) html += '<span class="ds-log-count ds-log-count-error">' + counts.error + ' errors</span>';
  if (counts.warn > 0) html += '<span class="ds-log-count ds-log-count-warn">' + counts.warn + ' warns</span>';
  bar.innerHTML = html;
}

function scrollToLogBottom() {
  var area = document.getElementById('__ds-log-area');
  if (area) area.scrollTop = area.scrollHeight;
}

function exportLogs() {
  if (!executionHistory || executionHistory.length === 0) { logPanel('warn', '没有可导出的日志'); return; }
  var text = '=== AgentBridge Logs ===\n';
  for (var i = 0; i < executionHistory.length; i++) {
    text += '[' + (executionHistory[i].time || '--:--') + '] [' + (executionHistory[i].level || 'info').toUpperCase() + '] ' + (executionHistory[i].message || '') + '\n';
  }
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'agent-logs-' + Date.now() + '.txt'; a.click();
  URL.revokeObjectURL(url);
  logPanel('info', '日志已导出');
}

// logPanel is defined in core/logger.js (loaded first)

// ============================================================
// Server status
// ============================================================
// updateServerStatusUI and setStageText are defined in connection.js (loaded first)

function updateSSEIndicator(active) {
  var badge = document.getElementById('__ds-sse-badge');
  if (!badge) return;
  if (active) {
    badge.classList.add('active');
    badge.title = 'SSE 流拦截: 启用 (v' + PANEL_VERSION + ')';
  } else {
    badge.classList.remove('active');
    badge.title = 'SSE 流拦截: 空闲 (v' + PANEL_VERSION + ')';
  }
}

// ============================================================
// QA Editor modal
// ============================================================
function showQAEditor(actions) {
  if (!actions || !Array.isArray(actions)) actions = [];
  var modal = document.getElementById('__ds-qa-modal');
  var overlay = document.getElementById('__ds-modal-overlay');
  if (!modal || !overlay) return;
  hideAllModals();
  overlay.classList.add('show');
  modal.style.display = 'block';
  var entries = document.getElementById('__ds-qa-entries');
  if (!entries) return;
  var html = '';
  var count = Math.max(actions.length, 2);
  for (var i = 0; i < count; i++) {
    var act = actions[i] || { label: '', prompt: '' };
    html += '<div class="ds-qa-entry">';
    html += '<div class="ds-form-group"><label class="ds-form-label">Label</label>';
    html += '<input class="ds-form-input ds-qa-label" value="' + escapeAttr(act.label || '') + '" placeholder="例如：总结对话" /></div>';
    html += '<div class="ds-form-group"><label class="ds-form-label">Prompt</label>';
    html += '<textarea class="ds-form-input ds-qa-prompt" rows="2" placeholder="AI 收到的提示词...">' + escapeAttr(act.prompt || '') + '</textarea></div>';
    html += '</div>';
  }
  entries.innerHTML = html;
}

async function saveQuickActions() {
  var entries = document.querySelectorAll('#__ds-qa-entries .ds-qa-entry');
  var actions = [];
  for (var i = 0; i < entries.length; i++) {
    var label = entries[i].querySelector('.ds-qa-label');
    var prompt = entries[i].querySelector('.ds-qa-prompt');
    if (label && prompt && label.value.trim() && prompt.value.trim()) {
      actions.push({ label: label.value.trim(), prompt: prompt.value.trim() });
    }
  }
  if (actions.length === 0) { alert('至少需要一项有效的快捷操作'); return; }
  if (actions.length > 5) { alert('最多 5 项'); return; }
  window.__ds_quickActions = actions;
  updateQuickActionButtons(actions);
  if (window.__ds_saveQuickActions) await window.__ds_saveQuickActions(actions);
  hideAllModals();
  logPanel('info', '快捷操作已保存');
}

function hideAllModals() {
  var overlay = document.getElementById('__ds-modal-overlay');
  if (overlay) overlay.classList.remove('show');
  var qaModal = document.getElementById('__ds-qa-modal');
  if (qaModal) qaModal.style.display = 'none';
  var rawModal = document.getElementById('__ds-rawlogs-modal');
  if (rawModal) rawModal.style.display = 'none';
}

// ============================================================
// Utility
// ============================================================
function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildEmptyStateHTML(text, hint, icon) {
  return '<div class="ds-empty-state"><span class="ds-empty-icon">' + (icon || '\u2699') + '</span><div class="ds-empty-text">' +
    escapeAttr(text) + '</div><div class="ds-empty-hint">' + escapeAttr(hint || '') + '</div></div>';
}

// ============================================================
// Exports to window (for actions.js / external callers)
// ============================================================
window.injectOperationPanel = injectPanelHTML;
window.renderToolsList = renderToolsList;
window.renderSkillsList = renderSkillsList;
window.updateAgentPanelUI = updateAgentPanelUI;
window.renderLogs = renderLogs;
window.updateQuickActionButtons = updateQuickActionButtons;
window.showQuickActionsEditor = showQAEditor;
window.hideAllModals = hideAllModals;
window.updateSSEIndicator = updateSSEIndicator;
window.switchView = switchView;
// 兼容旧调用名
window.switchLeftTab = switchView;
window.__ds_retryConnect = function() { logPanel('info', '手动重试连接...'); if (typeof window.ensureServerRunning === 'function') window.ensureServerRunning(); };

// ============================================================
// Auto init
// ============================================================
(function() {
  if (document.getElementById('__ds-agent-panel')) return;
  injectPanelCSS();
  injectPanelHTML();
  var pet = document.getElementById('__ds-pet-ball');
  var panel = document.getElementById('__ds-agent-panel');

  var __ds_healthTimer = null;

  function startHealthPolling() {
    if (__ds_healthTimer) clearInterval(__ds_healthTimer);
    function check() {
      try {
        if (window.checkServerStatus) {
          window.checkServerStatus();
        } else if (window.checkServerHealth) {
          window.checkServerHealth().then(function(r) { updateServerStatusUI(r && r.healthy); });
        }
      } catch(e) {}
    }
    check();
    __ds_healthTimer = setInterval(check, 30000);
  }

  setTimeout(function() {
    startHealthPolling();
  }, 1000);

  // ── 自愈：面板 / 悬浮球被外部移除时自动重建（防快捷键失效）──
  // 某些页面（SPA 路由 / 虚拟列表重渲染）可能清掉 body 自定义元素，
  // 此时 Ctrl+Shift+D 会因找不到元素而失效。检测到丢失后重建面板。
  var __ds_selfHealTimer = null;
  function ensurePanelAlive() {
    if (__ds_selfHealTimer) return;
    __ds_selfHealTimer = setTimeout(function() {
      __ds_selfHealTimer = null;
      try {
        var panel = document.getElementById('__ds-agent-panel');
        var pet = document.getElementById('__ds-pet-ball');
        // 页面刚加载 / body 不存在时不处理
        if (!document.body || document.readyState === 'loading') return;
        // 都还在则无需处理
        if (panel && pet && document.body.contains(panel) && document.body.contains(pet)) return;
        if (!document.getElementById('__ds-agent-panel')) {
          injectPanelCSS();
          injectPanelHTML();
        }
      } catch(e) {}
    }, 500);
  }

  try {
    var __ds_healObs = new MutationObserver(function() { ensurePanelAlive(); });
    __ds_healObs.observe(document.body, { childList: true, subtree: true });
  } catch(e) {}
})();

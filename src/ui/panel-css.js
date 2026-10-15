// ============================================================
// AgentBridge — Panel CSS v3 (SPOTLIGHT · Raycast-style Launcher)
// 设计语言：亮色清爽 Spotlight 启动器
//  - 白色纸面 + 靛蓝强调（参考 pi-web-ui / DeepSeek Harness 的现代感）
//  - 居中启动器卡片：大搜索框 + 视图胶囊 + 分组结果 + 键盘导航
//  - 主题：亮色（默认/跟随系统），可手动切换暗色
//  - 保持旧版跨文件 DOM 契约：#__ds-* 元素与 .ds-btn/.ds-modal 等公共类
// ============================================================

function injectPanelCSS() {
  var s = document.getElementById('__ds-agent-css');
  if (s) return;
  s = document.createElement('style');
  s.id = '__ds-agent-css';

  var css = `
/* ============================================================
   Design Tokens — Light (默认)
   ============================================================ */
:root {
  /* 表面 */
  --ds-bg:            #FFFFFF;
  --ds-surface:       #FFFFFF;
  --ds-surface-2:     #F7F7F8;
  --ds-surface-3:     #EFEFF2;
  --ds-inset:         #F4F4F6;

  /* 文本 */
  --ds-text:          #17171B;
  --ds-text-2:        #52525B;
  --ds-text-3:        #8E8E98;
  --ds-text-faint:    #B4B4BC;

  /* 线框 */
  --ds-border:        rgba(23,23,28,0.10);
  --ds-border-strong: rgba(23,23,28,0.16);

  /* 强调：靛蓝 */
  --ds-accent:        #4B3FE3;
  --ds-accent-strong: #3C2ECA;
  --ds-accent-soft:   #EEECFE;
  --ds-accent-text:   #3C2ECA;
  --ds-on-accent:     #FFFFFF;

  /* 语义色 */
  --ds-success:       #0F9D6E;
  --ds-success-soft:  #E5F6F0;
  --ds-warn:          #C77417;
  --ds-warn-soft:     #FBF0E1;
  --ds-error:         #D9403A;
  --ds-error-soft:    #FCEAE9;
  --ds-info:          #2468D6;
  --ds-info-soft:     #EAF1FC;

  /* 阴影 */
  --ds-shadow-1: 0 1px 2px rgba(23,23,28,0.06);
  --ds-shadow-2: 0 2px 8px rgba(23,23,28,0.08);
  --ds-shadow-3: 0 6px 20px rgba(23,23,28,0.10);
  --ds-shadow-4: 0 18px 50px -12px rgba(20,20,40,0.18), 0 4px 14px -4px rgba(20,20,40,0.08);

  /* 圆角 */
  --ds-radius-sm: 7px;
  --ds-radius-md: 11px;
  --ds-radius-lg: 15px;
  --ds-radius-full: 999px;

  /* 字体 */
  --ds-font: "SF Pro Text", "PingFang SC", -apple-system, "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif;
  --ds-font-mono: ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", "Consolas", monospace;

  /* 字号 */
  --ds-fs-xs: 11px;
  --ds-fs-sm: 12px;
  --ds-fs-base: 13px;
  --ds-fs-lg: 15px;
  --ds-fs-xl: 19px;

  /* 动效 */
  --ds-ease: 0.14s ease;
  --ds-ease-out: cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* ============================================================
   Dark — 跟随系统（未手动指定亮色时生效）
   ============================================================ */
@media (prefers-color-scheme: dark) {
  :root:not([data-ds-theme="light"]) {
    --ds-bg:            #151519;
    --ds-surface:       #1D1D23;
    --ds-surface-2:     #26262D;
    --ds-surface-3:     #2E2E36;
    --ds-inset:         #1A1A1F;

    --ds-text:          #ECECEF;
    --ds-text-2:        #A1A1AA;
    --ds-text-3:        #6E6E78;
    --ds-text-faint:    #55555E;

    --ds-border:        rgba(255,255,255,0.09);
    --ds-border-strong: rgba(255,255,255,0.16);

    --ds-accent:        #6A5FF0;
    --ds-accent-strong: #8A80FF;
    --ds-accent-soft:   #282353;
    --ds-accent-text:   #CFD8FF;
    --ds-on-accent:     #FFFFFF;

    --ds-success:       #2BD59A;
    --ds-success-soft:  #123F33;
    --ds-warn:          #E8A23D;
    --ds-warn-soft:     #3A2E15;
    --ds-error:         #F2706B;
    --ds-error-soft:    #3D2120;
    --ds-info:          #5C9DF6;
    --ds-info-soft:     #16293D;

    --ds-shadow-1: 0 1px 2px rgba(0,0,0,0.4);
    --ds-shadow-2: 0 2px 8px rgba(0,0,0,0.45);
    --ds-shadow-3: 0 6px 20px rgba(0,0,0,0.5);
    --ds-shadow-4: 0 18px 50px -12px rgba(0,0,0,0.6), 0 4px 14px -4px rgba(0,0,0,0.4);
  }
}

/* ============================================================
   Dark — 手动指定（覆盖系统）
   ============================================================ */
:root[data-ds-theme="dark"] {
  --ds-bg:            #151519;
  --ds-surface:       #1D1D23;
  --ds-surface-2:     #26262D;
  --ds-surface-3:     #2E2E36;
  --ds-inset:         #1A1A1F;

  --ds-text:          #ECECEF;
  --ds-text-2:        #A1A1AA;
  --ds-text-3:        #6E6E78;
  --ds-text-faint:    #55555E;

  --ds-border:        rgba(255,255,255,0.09);
  --ds-border-strong: rgba(255,255,255,0.16);

  --ds-accent:        #6A5FF0;
  --ds-accent-strong: #8A80FF;
  --ds-accent-soft:   #282353;
  --ds-accent-text:   #CFD8FF;
  --ds-on-accent:     #FFFFFF;

  --ds-success:       #2BD59A;
  --ds-success-soft:  #123F33;
  --ds-warn:          #E8A23D;
  --ds-warn-soft:     #3A2E15;
  --ds-error:         #F2706B;
  --ds-error-soft:    #3D2120;
  --ds-info:          #5C9DF6;
  --ds-info-soft:     #16293D;

  --ds-shadow-1: 0 1px 2px rgba(0,0,0,0.4);
  --ds-shadow-2: 0 2px 8px rgba(0,0,0,0.45);
  --ds-shadow-3: 0 6px 20px rgba(0,0,0,0.5);
  --ds-shadow-4: 0 18px 50px -12px rgba(0,0,0,0.6), 0 4px 14px -4px rgba(0,0,0,0.4);
}

/* ============================================================
   Reset
   ============================================================ */
#__ds-agent-panel *, #__ds-pet-ball *, #__ds-modal-overlay * { box-sizing: border-box; margin: 0; padding: 0; }

/* ============================================================
   Panel — Spotlight 卡片（左上角定位，可拖拽/可调整大小）
   ============================================================ */
#__ds-agent-panel {
  position: fixed; left: 100px; top: 100px; z-index: 2147483640;
  width: 680px; max-width: calc(100vw - 48px);
  height: 600px; max-height: calc(100vh - 64px);
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: 16px;
  font-family: var(--ds-font); font-size: var(--ds-fs-base);
  color: var(--ds-text);
  display: none !important;
  overflow: hidden;
  flex-direction: column;
  box-shadow: var(--ds-shadow-4);
  letter-spacing: -0.01em;
  transform-origin: top left;
  resize: none;
}
#__ds-agent-panel.visible { display: flex !important; animation: ds-panel-in 0.2s var(--ds-ease-out); }
#__ds-agent-panel.closing { animation: ds-panel-out 0.13s ease forwards; }

@keyframes ds-panel-in {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes ds-panel-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.97); }
}

/* 面板拖拽光标：头部可拖 */
#__ds-launcher-head.ds-dragging { user-select: none; cursor: grabbing; }
#__ds-launcher-head { cursor: default; }

/* 调整大小手柄 */
#__ds-resize-handle {
  position: absolute; right: 0; bottom: 0;
  width: 18px; height: 18px;
  cursor: nwse-resize;
  z-index: 10;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding: 3px;
  opacity: 0;
  transition: opacity 0.14s;
}
#__ds-agent-panel:hover #__ds-resize-handle { opacity: 0.7; }
#__ds-resize-handle::after {
  content: '';
  width: 8px; height: 8px;
  border-right: 2px solid var(--ds-text-3);
  border-bottom: 2px solid var(--ds-text-3);
  border-bottom-right-radius: 2px;
}

/* ============================================================
   Launcher Head — 搜索 + 状态
   ============================================================ */
#__ds-launcher-head {
  flex-shrink: 0;
  border-bottom: 1px solid var(--ds-border);
  background: var(--ds-surface);
  padding: 14px 16px 12px;
}

/* 搜索框（Hero） */
#__ds-search-wrap {
  display: flex; align-items: center; gap: 10px;
  background: var(--ds-surface-2);
  border: 1px solid var(--ds-border);
  border-radius: 12px;
  padding: 10px 14px;
  transition: border-color var(--ds-ease), box-shadow var(--ds-ease), background var(--ds-ease);
}
#__ds-search-wrap:focus-within {
  border-color: var(--ds-accent);
  background: var(--ds-surface);
  box-shadow: 0 0 0 3px var(--ds-accent-soft), 0 2px 8px rgba(23,23,28,0.06);
}
#__ds-search-icon {
  font-size: 15px; color: var(--ds-text-3);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
#__ds-search {
  flex: 1; min-width: 0;
  border: none; background: none; outline: none;
  font-family: var(--ds-font); font-size: 15px;
  color: var(--ds-text);
  letter-spacing: -0.01em;
}
#__ds-search::placeholder { color: var(--ds-text-3); }
#__ds-search-clear {
  border: none; background: none; cursor: pointer;
  font-size: 14px; color: var(--ds-text-3); flex-shrink: 0;
  width: 22px; height: 22px; border-radius: 6px;
  display: none; align-items: center; justify-content: center;
  transition: all var(--ds-ease);
}
#__ds-search-clear:hover { background: var(--ds-surface-3); color: var(--ds-text); }
#__ds-search-clear.show { display: flex; }
#__ds-search-kbd {
  flex-shrink: 0;
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 600;
  color: var(--ds-text-3);
  border: 1px solid var(--ds-border); border-radius: 5px;
  padding: 2px 6px; background: var(--ds-surface);
  white-space: nowrap;
}

/* 头部工具条（第二行） */
#__ds-launcher-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 10px;
}
#__ds-status {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--ds-fs-xs); color: var(--ds-text-2);
  min-width: 0;
}
#__ds-h-status-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--ds-text-faint);
  flex-shrink: 0;
  transition: background 0.25s, box-shadow 0.25s;
}
/* 连接状态点（connection.js 设置 class） */
#__ds-pet-dot.connected, #__ds-h-status-dot.connected {
  background: var(--ds-success);
  box-shadow: 0 0 6px var(--ds-success-soft);
}
#__ds-pet-dot.disconnected, #__ds-h-status-dot.disconnected {
  background: var(--ds-text-faint);
  box-shadow: none;
}
#__ds-status-text {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--ds-text-2);
}
#__ds-platform-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: var(--ds-radius-full);
  background: var(--ds-accent-soft); color: var(--ds-accent-text);
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  flex-shrink: 0;
}
.ds-sse-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 1px 8px; border-radius: var(--ds-radius-full);
  background: var(--ds-surface-3); color: var(--ds-text-3);
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase;
  flex-shrink: 0; cursor: default; user-select: none; white-space: nowrap;
  transition: all 0.3s;
}
.ds-sse-badge.active {
  background: var(--ds-success-soft); color: var(--ds-success);
  animation: ds-sse-pulse 2.2s ease-in-out infinite;
}
@keyframes ds-sse-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(15,157,110,0); }
  50% { box-shadow: 0 0 0 4px rgba(15,157,110,0.12); }
}
#__ds-launcher-actions {
  display: flex; align-items: center; gap: 3px; flex-shrink: 0;
}
.ds-hbtn {
  width: 30px; height: 30px; border: none;
  border-radius: 9px; background: none; cursor: pointer;
  font-size: 15px; display: flex; align-items: center; justify-content: center;
  color: var(--ds-text-3); transition: all var(--ds-ease);
  font-family: var(--ds-font);
  flex-shrink: 0;
}
.ds-hbtn:hover { background: var(--ds-surface-3); color: var(--ds-text); }
.ds-hbtn.ds-hbtn-close:hover { background: var(--ds-error-soft); color: var(--ds-error); }
#__ds-btn-theme { font-size: 14px; }

/* ============================================================
   View Pills — 视图胶囊
   ============================================================ */
#__ds-launcher-nav {
  display: flex; gap: 5px; padding: 10px 16px 0;
  flex-shrink: 0; overflow-x: auto; scrollbar-width: none;
}
#__ds-launcher-nav::-webkit-scrollbar { display: none; }
.ds-pill {
  padding: 5px 13px; border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-full);
  background: var(--ds-surface);
  font-family: var(--ds-font); font-size: var(--ds-fs-sm); font-weight: 550;
  color: var(--ds-text-2); cursor: pointer; white-space: nowrap;
  transition: all var(--ds-ease);
  display: inline-flex; align-items: center; gap: 6px;
}
.ds-pill:hover { background: var(--ds-surface-2); color: var(--ds-text); border-color: var(--ds-border-strong); }
.ds-pill.active {
  background: var(--ds-accent); border-color: var(--ds-accent);
  color: var(--ds-on-accent); font-weight: 600;
}
.ds-pill .ds-pill-count {
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 700;
  opacity: 0.75;
}

/* ============================================================
   Body
   ============================================================ */
#__ds-launcher-body {
  flex: 1; overflow: hidden; min-height: 0;
  display: flex; flex-direction: column;
  padding: 10px 12px 6px;
}
.ds-view { display: none; flex-direction: column; flex: 1; overflow: hidden; min-height: 0; }
.ds-view.active { display: flex; }

/* ============================================================
   Group Label
   ============================================================ */
.ds-group-label {
  display: flex; align-items: center; gap: 6px;
  padding: 12px 6px 4px;
  font-size: 10px; font-weight: 600;
  color: var(--ds-text-3);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.ds-group-label:first-child { padding-top: 2px; }
.ds-group-label .ds-group-name {
  display: inline-flex; align-items: center; gap: 4px;
}
.ds-group-label .ds-group-count {
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 500;
  color: var(--ds-text-faint);
  background: var(--ds-surface-2);
  padding: 1px 6px;
  border-radius: var(--ds-radius-full);
  line-height: 1.3;
}

/* ============================================================
   Tool Cards — Spotlight 行
   ============================================================ */
#__ds-tools-container {
  flex: 1; overflow-y: auto; min-height: 0;
  display: flex; flex-direction: column; gap: 1px;
  padding: 4px 4px 10px;
}
.ds-tool-card {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 10px; border-radius: var(--ds-radius-md);
  cursor: default; transition: background var(--ds-ease), box-shadow var(--ds-ease);
  animation: ds-card-in 0.16s var(--ds-ease-out) both;
  animation-delay: calc(var(--i, 0) * 14ms);
  border: 1px solid transparent;
  position: relative;
  min-height: 44px;
}
.ds-tool-card:hover { background: var(--ds-surface-2); }
.ds-tool-card.ds-active {
  background: var(--ds-accent-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 30%, transparent);
}
@keyframes ds-card-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.ds-tool-icon {
  width: 30px; height: 30px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
  background: var(--ds-surface-3);
  border: 1px solid var(--ds-border);
  color: var(--ds-text-2);
  font-size: 14px;
  transition: all var(--ds-ease);
}
.ds-tool-card:hover .ds-tool-icon,
.ds-tool-card.ds-active .ds-tool-icon {
  color: var(--ds-accent);
  border-color: color-mix(in srgb, var(--ds-accent) 40%, transparent);
  background: var(--ds-accent-soft);
}
.ds-tool-info { flex: 1; min-width: 0; padding-right: 4px; }
.ds-tool-name {
  font-family: var(--ds-font-mono); font-size: 12px; font-weight: 600;
  color: var(--ds-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  line-height: 1.3;
}
.ds-tool-desc {
  font-size: 11px; color: var(--ds-text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-top: 1px;
  line-height: 1.4;
}

/* 模式分段控件 — 紧凑单字符 */
.ds-tool-mode {
  display: inline-flex; align-items: center;
  padding: 2px; border-radius: 8px;
  background: var(--ds-surface-2);
  border: 1px solid var(--ds-border);
  flex-shrink: 0; user-select: none;
  gap: 0;
}
.ds-mode-seg {
  border: none; background: none; cursor: pointer;
  font-family: var(--ds-font-mono); font-size: 9px; font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--ds-text-3);
  width: 22px; height: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px;
  transition: all var(--ds-ease);
  line-height: 1;
  padding: 0;
}
.ds-mode-seg:hover { color: var(--ds-text-2); background: var(--ds-surface); }
.ds-tool-mode[data-mode-state="auto"]  .ds-mode-seg[data-mode="auto"]  { color: var(--ds-success); background: var(--ds-success-soft); }
.ds-tool-mode[data-mode-state="manual"] .ds-mode-seg[data-mode="manual"] { color: var(--ds-warn); background: var(--ds-warn-soft); }
.ds-tool-mode[data-mode-state="off"]  .ds-mode-seg[data-mode="off"]  { color: var(--ds-text-2); background: var(--ds-surface-3); }

/* ============================================================
   Skills
   ============================================================ */
#__ds-view-skills { padding: 2px 4px; }
#__ds-skills-container { flex: 1; overflow-y: auto; min-height: 0; padding: 2px 0; }
.ds-skill-row {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; border-radius: var(--ds-radius-md);
  transition: background var(--ds-ease);
  border: 1px solid transparent;
  cursor: pointer;
}
.ds-skill-row:hover { background: var(--ds-surface-2); }
.ds-skill-row.ds-active { background: var(--ds-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 30%, transparent); }
.ds-skill-name {
  font-size: var(--ds-fs-sm); font-weight: 550; color: var(--ds-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ds-skill-desc {
  font-size: var(--ds-fs-xs); color: var(--ds-text-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 2px;
}
.ds-skill-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; flex-shrink: 0; }
.ds-toggle-pill {
  width: 36px; height: 20px; border-radius: var(--ds-radius-full);
  position: relative; transition: background var(--ds-ease);
  border: 1px solid var(--ds-border-strong);
}
.ds-toggle-pill.on { background: var(--ds-accent); border-color: var(--ds-accent); }
.ds-toggle-pill.off { background: var(--ds-surface-3); }
.ds-toggle-knob {
  position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--ds-on-accent);
  transition: transform 0.18s var(--ds-ease-out);
  box-shadow: var(--ds-shadow-1);
}
.ds-toggle-pill.on .ds-toggle-knob { transform: translateX(16px); background: var(--ds-on-accent); }
.ds-add-skill-btn {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  margin: 8px 0 2px;
  padding: 9px 10px;
  border: 1px dashed var(--ds-border-strong); border-radius: var(--ds-radius-md);
  font-size: var(--ds-fs-sm); color: var(--ds-text-3);
  background: none; cursor: pointer;
  font-family: var(--ds-font); transition: all var(--ds-ease);
  flex-shrink: 0;
}
.ds-add-skill-btn:hover {
  background: var(--ds-accent-soft);
  border-color: var(--ds-accent); color: var(--ds-accent);
}

/* ============================================================
   Files
   ============================================================ */
#__ds-view-files { padding: 2px 4px; }
#__ds-fe-current-path {
  padding: 6px 10px; font-size: var(--ds-fs-xs);
  color: var(--ds-text-3); background: var(--ds-surface-2);
  border: 1px solid var(--ds-border); border-radius: var(--ds-radius-md);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: var(--ds-font-mono); flex-shrink: 0;
  margin-bottom: 6px;
}
#__ds-file-tree { flex: 1; overflow-y: auto; min-height: 0; padding: 2px 0; }
.__ds-file-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; cursor: pointer;
  font-size: var(--ds-fs-sm);
  transition: background var(--ds-ease);
  border-radius: var(--ds-radius-md);
  position: relative;
  border: 1px solid transparent;
}
.__ds-file-item:hover { background: var(--ds-surface-2); }
.__ds-file-selected { background: var(--ds-accent-soft) !important; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 30%, transparent); }
.__ds-file-item.ds-active { background: var(--ds-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 30%, transparent); }
.__ds-file-icon { font-size: 13px; flex-shrink: 0; width: 17px; text-align: center; }
.__ds-file-dir .__ds-file-icon { color: var(--ds-info); }
.__ds-file-name {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ds-text); flex: 1;
}
.__ds-file-size {
  font-family: var(--ds-font-mono); font-size: var(--ds-fs-xs); color: var(--ds-text-faint);
  flex-shrink: 0; margin-left: auto;
}
.__ds-file-loading, .__ds-file-error {
  padding: 28px 16px; text-align: center;
  color: var(--ds-text-3); font-size: var(--ds-fs-sm); line-height: 1.7;
}
.__ds-file-error { color: var(--ds-error); }

#__ds-file-preview {
  display: flex; flex-direction: column;
  border-top: 1px solid var(--ds-border);
  max-height: 200px; overflow: hidden; flex-shrink: 0;
  background: var(--ds-surface-2);
  border-radius: 0 0 var(--ds-radius-md) var(--ds-radius-md);
}
#__ds-file-preview.__ds-hidden { display: none; }
.__ds-preview-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px;
  background: var(--ds-inset);
  border-bottom: 1px solid var(--ds-border);
  flex-shrink: 0;
}
.__ds-preview-title {
  font-size: var(--ds-fs-xs); font-weight: 600;
  color: var(--ds-text); font-family: var(--ds-font-mono);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.__ds-preview-close {
  width: 24px; height: 24px; border: none; background: none;
  cursor: pointer; font-size: 14px; color: var(--ds-text-3);
  border-radius: 7px; display: flex;
  align-items: center; justify-content: center;
  transition: all var(--ds-ease); flex-shrink: 0;
}
.__ds-preview-close:hover { background: var(--ds-surface-3); color: var(--ds-text); }
.__ds-preview-content {
  flex: 1; overflow-y: auto; padding: 10px 12px;
  font-family: var(--ds-font-mono); font-size: var(--ds-fs-xs);
  line-height: 1.55; color: var(--ds-text-2);
  white-space: pre-wrap; word-break: break-all;
  margin: 0;
}

/* ============================================================
   Logs
   ============================================================ */
#__ds-view-logs { padding: 2px 4px; }
#__ds-log-tabs { display: flex; gap: 3px; flex-shrink: 0; padding: 2px 0 6px; }
.ds-log-tab {
  padding: 4px 11px; border: 1px solid transparent;
  background: none; font-family: var(--ds-font-mono); font-size: 9.5px; font-weight: 600;
  color: var(--ds-text-3); cursor: pointer;
  border-radius: var(--ds-radius-full); transition: all var(--ds-ease);
  letter-spacing: 0.04em;
  display: inline-flex; align-items: center; gap: 5px;
}
.ds-log-tab .ds-tab-count {
  font-size: 8px; color: var(--ds-text-faint);
  background: var(--ds-surface-3); padding: 0 5px; border-radius: var(--ds-radius-full);
}
.ds-log-tab:hover { background: var(--ds-surface-2); color: var(--ds-text); }
.ds-log-tab.active {
  background: var(--ds-surface-3); color: var(--ds-text); font-weight: 700;
  border-color: var(--ds-border);
}
.ds-log-tab.active .ds-tab-count { color: var(--ds-text-2); background: var(--ds-surface); }

.ds-log-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0 6px; flex-shrink: 0;
}
.ds-log-tb-btn {
  padding: 4px 11px; border: 1px solid var(--ds-border);
  border-radius: 8px;
  background: var(--ds-surface); font-size: var(--ds-fs-xs);
  cursor: pointer; color: var(--ds-text-2);
  font-family: var(--ds-font); transition: all var(--ds-ease);
}
.ds-log-tb-btn:hover {
  border-color: var(--ds-accent); background: var(--ds-accent-soft); color: var(--ds-accent);
}

#__ds-log-area {
  flex: 1; overflow-y: auto; padding: 4px 2px 8px;
  font-size: var(--ds-fs-xs); line-height: 1.65;
  font-family: var(--ds-font);
  min-height: 0;
}
.ds-log-entry {
  padding: 5px 8px; display: flex; gap: 7px; align-items: baseline;
  border-bottom: 1px solid color-mix(in srgb, var(--ds-border) 60%, transparent);
  transition: background var(--ds-ease);
  border-radius: var(--ds-radius-sm);
  cursor: pointer;
}
.ds-log-entry:hover { background: var(--ds-surface-2); }
.ds-log-entry.ds-log-expanded { background: var(--ds-surface-2); padding: 6px 8px; }
.ds-log-entry.ds-active { background: var(--ds-accent-soft); }
.ds-log-time {
  font-family: var(--ds-font-mono); font-size: 8.5px; color: var(--ds-text-faint);
  flex-shrink: 0; margin-top: 1px;
}
.ds-log-badge {
  padding: 0 5px; border-radius: 5px;
  font-size: 8px; font-weight: 700; flex-shrink: 0;
  text-transform: uppercase; letter-spacing: 0.06em;
  line-height: 15px; height: 15px; margin-top: 1px;
}
.ds-badge-info    { background: var(--ds-info-soft);    color: var(--ds-info); }
.ds-badge-warn    { background: var(--ds-warn-soft);    color: var(--ds-warn); }
.ds-badge-error   { background: var(--ds-error-soft);   color: var(--ds-error); }
.ds-badge-success { background: var(--ds-success-soft); color: var(--ds-success); }
.ds-log-msg { color: var(--ds-text-2); word-break: break-word; flex: 1; }
.ds-log-detail {
  padding: 6px 0 2px 0;
  font-family: var(--ds-font-mono); font-size: var(--ds-fs-xs);
  color: var(--ds-text-3);
  line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
  border-top: 1px dashed var(--ds-border);
  margin-top: 4px; width: 100%;
}
.ds-log-entry.ds-log-expanded .ds-log-msg { color: var(--ds-text); }

.ds-log-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 2px 0;
  border-top: 1px solid var(--ds-border);
  flex-shrink: 0;
}
.ds-log-count-bar { display: flex; gap: 8px; overflow: hidden; }
.ds-log-count {
  font-family: var(--ds-font-mono); font-size: 9px; color: var(--ds-text-faint);
  font-weight: 600; white-space: nowrap;
}
.ds-log-count-error { color: var(--ds-error); }
.ds-log-count-warn { color: var(--ds-warn); }
.ds-log-scroll-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: var(--ds-radius-full);
  background: var(--ds-surface-2);
  border: 1px solid var(--ds-border);
  font-size: 9px; color: var(--ds-text-3);
  cursor: pointer; transition: all var(--ds-ease);
  font-family: var(--ds-font); flex-shrink: 0;
}
.ds-log-scroll-btn.active {
  color: var(--ds-accent); border-color: color-mix(in srgb, var(--ds-accent) 40%, transparent);
  background: var(--ds-accent-soft);
}
#__ds-chain-dots {
  font-size: 8px; letter-spacing: 1px; flex-shrink: 0;
  white-space: nowrap; color: var(--ds-text-3);
}
#__ds-chain-dots:empty { display: none; }
#__ds-progress-indicator {
  font-family: var(--ds-font-mono); font-size: 9px;
  color: var(--ds-info); flex-shrink: 0; white-space: nowrap;
  max-width: 160px; overflow: hidden; text-overflow: ellipsis;
}
#__ds-progress-indicator:empty { display: none; }

/* ============================================================
   Quick View
   ============================================================ */
#__ds-view-quick { padding: 4px; }
#__ds-view-quick .ds-quick-group {
  font-size: 10px; font-weight: 650; color: var(--ds-text-3);
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 8px 6px 5px;
}
.ds-action-row {
  display: flex; align-items: center; gap: 11px;
  padding: 9px 10px; border-radius: var(--ds-radius-md);
  cursor: pointer; transition: background var(--ds-ease);
  border: 1px solid transparent;
}
.ds-action-row:hover { background: var(--ds-surface-2); }
.ds-action-row.ds-active { background: var(--ds-accent-soft); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 30%, transparent); }
/* 一键启动（主操作）高亮 */
.ds-action-row--primary {
  background: var(--ds-accent-soft);
  border-color: color-mix(in srgb, var(--ds-accent) 35%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ds-accent) 20%, transparent);
}
.ds-action-row--primary:hover { background: color-mix(in srgb, var(--ds-accent-soft) 60%, var(--ds-surface-2)); }
.ds-action-row--primary .ds-action-name { color: var(--ds-accent-text); }
.ds-action-row--primary .ds-action-icon { background: var(--ds-accent); color: var(--ds-on-accent); border-color: var(--ds-accent); }
.ds-action-icon {
  width: 30px; height: 30px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 9px;
  background: var(--ds-surface-3); border: 1px solid var(--ds-border);
  color: var(--ds-text-2); font-size: 14px;
}
.ds-action-info { flex: 1; min-width: 0; }
.ds-action-name { font-size: var(--ds-fs-sm); font-weight: 600; color: var(--ds-text); }
.ds-action-desc { font-size: var(--ds-fs-xs); color: var(--ds-text-3); margin-top: 2px; }
.ds-action-kbd {
  font-family: var(--ds-font-mono); font-size: 9px; color: var(--ds-text-3);
  border: 1px solid var(--ds-border); border-radius: 5px;
  padding: 1px 6px; background: var(--ds-surface); flex-shrink: 0;
}

/* Quick action chips */
#__ds-quick-btns {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 4px 6px 8px;
}
#__ds-quick-btns .ds-qbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--ds-accent) 32%, var(--ds-border));
  border-radius: var(--ds-radius-full);
  background: var(--ds-accent-soft); font-size: var(--ds-fs-sm);
  cursor: pointer; color: var(--ds-accent-text); white-space: nowrap;
  font-family: var(--ds-font); transition: all var(--ds-ease);
  line-height: 1;
}
#__ds-quick-btns .ds-qbtn:hover { background: var(--ds-accent); color: var(--ds-on-accent); border-color: var(--ds-accent); transform: translateY(-1px); }
.ds-qbtn-icon { font-size: 12px; line-height: 1; }
.ds-qbtn-empty {
  font-size: var(--ds-fs-xs); color: var(--ds-text-faint); padding: 6px;
}
#__ds-btn-edit-qa {
  margin: 0 6px 10px;
}

/* ============================================================
   Footer — Status Line
   ============================================================ */
#__ds-launcher-foot {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px 16px;
  border-top: 1px solid var(--ds-border);
  background: var(--ds-surface-2);
  font-size: var(--ds-fs-xs); color: var(--ds-text-3);
}
#__ds-foot-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
#__ds-panel-status-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--ds-text-faint);
  transition: all 0.25s;
}
#__ds-panel-status-dot.__ds-status-connected { background: var(--ds-success); box-shadow: 0 0 8px var(--ds-success-soft); }
#__ds-panel-status-dot.__ds-status-disconnected { background: var(--ds-error); box-shadow: 0 0 8px var(--ds-error-soft); }
#__ds-server-text {
  font-family: var(--ds-font-mono); font-size: 10px; white-space: nowrap;
  color: var(--ds-text-2);
}
#__ds-server-text.__ds-status-on { color: var(--ds-success); font-weight: 600; }
#__ds-server-text.__ds-status-off { color: var(--ds-error); }
#__ds-server-status-text {
  font-family: var(--ds-font-mono); font-size: 9px; color: var(--ds-text-3);
  white-space: nowrap;
}
#__ds-foot-right {
  display: flex; align-items: center; gap: 8px; min-width: 0;
  overflow: hidden;
}
#__ds-session-text, #__ds-stage-text { white-space: nowrap; }
#__ds-stage-text {
  max-width: 170px; overflow: hidden; text-overflow: ellipsis;
  color: var(--ds-text-3);
}
#__ds-agent-status-text {
  font-family: var(--ds-font-mono); font-size: 10px;
  color: var(--ds-text-2); white-space: nowrap;
}
#__ds-agent-status-text .ds-online { color: var(--ds-success); font-weight: 700; }
#__ds-agent-status-text .ds-tool-count { color: var(--ds-accent); font-weight: 600; }
.__ds-status-sep { color: var(--ds-text-faint); }

/* ============================================================
   Empty States
   ============================================================ */
.ds-empty-state {
  padding: 32px 16px; text-align: center;
  display: flex; flex-direction: column; align-items: center;
  gap: 7px;
}
.ds-empty-icon {
  font-size: 22px; opacity: 0.4;
  display: flex; align-items: center; justify-content: center;
  width: 48px; height: 48px; border-radius: 13px;
  background: var(--ds-surface-2); border: 1px dashed var(--ds-border-strong);
  margin-bottom: 2px;
}
.ds-empty-text { font-size: var(--ds-fs-sm); font-weight: 600; color: var(--ds-text-2); }
.ds-empty-hint { font-size: var(--ds-fs-xs); color: var(--ds-text-faint); max-width: 240px; line-height: 1.6; }

/* ============================================================
   Modal & Forms
   ============================================================ */
.ds-modal-overlay {
  position: fixed; inset: 0;
  background: rgba(15,15,20,0.32);
  backdrop-filter: blur(2px);
  z-index: 2147483647; display: none;
  align-items: center; justify-content: center;
}
.ds-modal-overlay.show { display: flex; padding: 20px; }
.ds-modal {
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-lg);
  padding: 20px; width: 460px; max-width: 92vw; max-height: 76vh;
  overflow-y: auto; position: relative;
  box-shadow: var(--ds-shadow-4); z-index: 1;
  color: var(--ds-text);
  animation: ds-modal-in 0.16s var(--ds-ease-out);
}
@keyframes ds-modal-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
.ds-modal-title {
  font-size: var(--ds-fs-lg); font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--ds-text);
}
.ds-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

/* ============================================================
   审批/确认悬浮浮层 — 独立于 overlay，可拖动
   - 不寄宿在 __ds-modal-overlay，不受 hideAllModals 影响（弹窗不消失、任务不挂起）
   - 默认右下角悬浮，标题栏可拖动
   ============================================================ */
#__ds-approval-layer {
  position: fixed; right: 24px; bottom: 24px;
  width: 400px; max-width: 92vw;
  z-index: 2147483647;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-lg);
  box-shadow: var(--ds-shadow-4);
  color: var(--ds-text);
  font-family: var(--ds-font);
  font-size: var(--ds-fs-base);
  letter-spacing: -0.01em;
  overflow: hidden;
  display: none;
  animation: ds-modal-in 0.16s var(--ds-ease-out);
}
#__ds-approval-layer.__ds-approval-show { display: block; }
.__ds-approval-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 12px;
  background: var(--ds-accent-soft);
  cursor: grab; user-select: none;
  border-bottom: 1px solid var(--ds-border);
  font-weight: 600; font-size: var(--ds-fs-sm); color: var(--ds-accent-text);
}
.__ds-approval-head:active { cursor: grabbing; }
.__ds-approval-close {
  border: none; background: transparent; cursor: pointer;
  color: var(--ds-text-3); font-size: 14px; line-height: 1;
  padding: 2px 6px; border-radius: 6px;
}
.__ds-approval-close:hover { background: var(--ds-surface-3); color: var(--ds-text); }
.__ds-approval-body { padding: 12px; max-height: 60vh; overflow-y: auto; }
.__ds-approval-body .__ds-approval-field {
  margin-bottom: 8px; font-size: var(--ds-fs-sm); color: var(--ds-text-2);
}
.__ds-approval-body .__ds-approval-field strong { color: var(--ds-text); }
.__ds-approval-body pre {
  margin: 6px 0 0; padding: 8px 10px;
  background: var(--ds-inset); border: 1px solid var(--ds-border); border-radius: 8px;
  font-family: var(--ds-font-mono); font-size: 11px; line-height: 1.5;
  color: var(--ds-text-2); white-space: pre-wrap; word-break: break-all;
  max-height: 200px; overflow: auto;
}
.__ds-approval-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 12px; border-top: 1px solid var(--ds-border);
}
.ds-form-group { margin-bottom: 10px; }
.ds-form-label {
  display: block; font-size: var(--ds-fs-xs); font-weight: 600;
  margin-bottom: 4px; color: var(--ds-text-2);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.ds-form-input {
  width: 100%; padding: 7px 10px;
  border: 1px solid var(--ds-border);
  border-radius: 8px;
  font-size: var(--ds-fs-sm); font-family: var(--ds-font);
  background: var(--ds-inset); color: var(--ds-text);
  outline: none; transition: border-color var(--ds-ease), box-shadow var(--ds-ease);
  resize: vertical;
}
.ds-form-input:focus {
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 3px var(--ds-accent-soft);
  background: var(--ds-surface);
}

.ds-btn {
  padding: 6px 16px; border: 1px solid var(--ds-border);
  border-radius: 9px;
  font-size: var(--ds-fs-sm); cursor: pointer;
  font-family: var(--ds-font);
  transition: all var(--ds-ease);
  color: var(--ds-text);
}
.ds-btn-primary {
  background: var(--ds-accent); color: var(--ds-on-accent); border-color: var(--ds-accent); font-weight: 600;
}
.ds-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
.ds-btn-secondary { background: var(--ds-surface); }
.ds-btn-secondary:hover { background: var(--ds-surface-2); border-color: var(--ds-border-strong); }
.ds-btn-danger {
  background: var(--ds-error-soft); color: var(--ds-error);
  border-color: color-mix(in srgb, var(--ds-error) 40%, transparent);
}
.ds-btn-danger:hover { background: var(--ds-error); color: var(--ds-on-accent); border-color: var(--ds-error); }
.ds-btn-success {
  background: var(--ds-success-soft); color: var(--ds-success);
  border-color: color-mix(in srgb, var(--ds-success) 40%, transparent);
}
.ds-btn-success:hover { background: var(--ds-success); color: var(--ds-on-accent); border-color: var(--ds-success); }
.ds-btn-sm { padding: 4px 11px; font-size: var(--ds-fs-xs); }

.ds-qa-entry {
  border: 1px solid var(--ds-border); padding: 11px;
  border-radius: var(--ds-radius-md); margin-bottom: 8px;
  background: var(--ds-surface-2);
  position: relative;
}
.ds-qa-entry::before {
  content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px;
  border-radius: 1px; background: var(--ds-accent); opacity: 0.6;
}

/* 原始日志预览（日志“更多”弹窗） */
#__ds-log-preview-area {
  width: 100%; height: 260px; margin-top: 10px;
  box-sizing: border-box;
  background: var(--ds-inset); border: 1px solid var(--ds-border);
  border-radius: 8px; padding: 10px 12px;
  font-family: var(--ds-font-mono); font-size: 11px; line-height: 1.6;
  color: var(--ds-text-2); overflow: auto;
  white-space: pre-wrap; word-break: break-all;
}

/* ============================================================
   Pet Ball — 悬浮信标
   ============================================================ */
#__ds-pet-ball {
  position: fixed; bottom: 22px; right: 22px; width: 52px; height: 52px;
  border-radius: 50%;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border-strong);
  display: flex; align-items: center; justify-content: center;
  cursor: grab; z-index: 2147483639;
  box-shadow: var(--ds-shadow-3);
  user-select: none;
  font-size: 22px;
  transition: transform 0.18s var(--ds-ease-out), box-shadow 0.3s;
  animation: ds-pet-float 3.2s ease-in-out infinite;
}
#__ds-pet-ball:hover {
  box-shadow: var(--ds-shadow-4), 0 0 22px var(--ds-accent-soft);
  transform: scale(1.1);
  animation: none;
  border-color: color-mix(in srgb, var(--ds-accent) 55%, var(--ds-border));
}
#__ds-pet-ball:active { cursor: grabbing; }
#__ds-pet-ball.visible { transform: scale(0); pointer-events: none; }
@keyframes ds-pet-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
#__ds-pet-dot {
  position: absolute; top: 3px; right: 3px;
  width: 9px; height: 9px; border-radius: 50%;
  z-index: 2;
  background: var(--ds-text-faint);
  transition: all 0.25s var(--ds-ease-out);
  border: 2px solid var(--ds-surface);
}

/* ============================================================
   Startup Guide (connection.js 注入到日志区)
   ============================================================ */
.ds-startup {
  padding: 20px 16px; text-align: center;
  display: flex; flex-direction: column; align-items: center;
}
.ds-startup-icon {
  font-size: 40px; margin-bottom: 10px; opacity: 0.7;
  width: 64px; height: 64px; border-radius: var(--ds-radius-lg);
  background: var(--ds-warn-soft); border: 1px solid var(--ds-border);
  display: flex; align-items: center; justify-content: center;
}
.ds-startup-title { font-weight: 650; margin-bottom: 6px; color: var(--ds-text); font-size: var(--ds-fs-lg); }
.ds-startup-sub { font-size: var(--ds-fs-xs); color: var(--ds-text-3); margin-bottom: 14px; }
.ds-startup-code {
  background: var(--ds-inset); border: 1px solid var(--ds-border);
  border-radius: var(--ds-radius-md); padding: 12px 14px; text-align: left;
  font-family: var(--ds-font-mono); font-size: 11px; margin-bottom: 14px;
  line-height: 1.7; width: 100%; max-width: 340px;
  color: var(--ds-text-2);
}
.ds-startup-code .ds-code-hl { color: var(--ds-success); }
.ds-startup-btn { margin-top: 2px; }

/* ============================================================
   Scrollbars & Selection
   ============================================================ */
#__ds-agent-panel ::-webkit-scrollbar { width: 9px; height: 9px; }
#__ds-agent-panel ::-webkit-scrollbar-track { background: transparent; }
#__ds-agent-panel ::-webkit-scrollbar-thumb {
  background: var(--ds-border-strong); border-radius: var(--ds-radius-full);
  border: 2px solid transparent; background-clip: content-box;
}
#__ds-agent-panel ::-webkit-scrollbar-thumb:hover { background-color: var(--ds-accent); background-clip: content-box; }
#__ds-agent-panel ::selection { background: var(--ds-accent-soft); color: var(--ds-text); }

/* ============================================================
   Reduced Motion
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  #__ds-agent-panel *, #__ds-pet-ball, #__ds-modal-overlay * {
    animation: none !important;
    transition: none !important;
  }
  #__ds-pet-ball { animation: none; }
}

/* ============================================================
   工具调用卡片 — 渲染到 DeepSeek 对话区（DeepSeek Harness 风格）
   结构：头部（icon + 工具名 + 状态徽章 + 计时 + 展开箭头）
        + 可折叠的 Body（参数、结果、错误）
   不修改 DeepSeek 自身 DOM，只在 AI 消息节点后插入
   ============================================================ */
.__ds-tool-card-wrap {
  margin: 8px 0 12px;
  font-family: var(--ds-font);
  font-size: 13px;
  color: var(--ds-text);
  letter-spacing: -0.01em;
  animation: __ds_tc_in 0.22s var(--ds-ease-out);
}
@keyframes __ds_tc_in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
.__ds-tool-card {
  border: 1px solid var(--ds-border);
  border-radius: 12px;
  background: var(--ds-surface);
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
  position: relative;
}
.__ds-tool-card-wrap[data-state="running"] .__ds-tool-card {
  border-color: color-mix(in srgb, var(--ds-info) 40%, var(--ds-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ds-info) 12%, transparent);
}
.__ds-tool-card-wrap[data-state="success"] .__ds-tool-card {
  border-color: color-mix(in srgb, var(--ds-success) 35%, var(--ds-border));
}
.__ds-tool-card-wrap[data-state="error"] .__ds-tool-card {
  border-color: color-mix(in srgb, var(--ds-error) 40%, var(--ds-border));
  background: linear-gradient(var(--ds-error-soft), var(--ds-surface)) padding-box;
}

.__ds-tool-card-head {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--ds-surface-2);
  border-bottom: 1px solid transparent;
  transition: background 0.14s;
}
.__ds-tool-card-head:hover { background: var(--ds-surface-3); }
.__ds-tool-card-wrap[data-state="running"] .__ds-tool-card-head {
  background: color-mix(in srgb, var(--ds-info) 6%, var(--ds-surface-2));
}
.__ds-tool-card-wrap[data-open="1"] .__ds-tool-card-head {
  border-bottom-color: var(--ds-border);
}

.__ds-tc-icon {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 7px;
  background: var(--ds-surface-3);
  border: 1px solid var(--ds-border);
  font-size: 12px;
  flex-shrink: 0;
  color: var(--ds-text-2);
}
.__ds-tool-card-wrap[data-state="running"] .__ds-tc-icon { color: var(--ds-info); border-color: color-mix(in srgb, var(--ds-info) 40%, transparent); background: var(--ds-info-soft); }
.__ds-tool-card-wrap[data-state="success"] .__ds-tc-icon { color: var(--ds-success); border-color: color-mix(in srgb, var(--ds-success) 40%, transparent); background: var(--ds-success-soft); }
.__ds-tool-card-wrap[data-state="error"]   .__ds-tc-icon { color: var(--ds-error);   border-color: color-mix(in srgb, var(--ds-error) 40%, transparent);   background: var(--ds-error-soft); }

.__ds-tc-title { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 6px; }
.__ds-tc-name {
  font-family: var(--ds-font-mono);
  font-size: 12px; font-weight: 600;
  color: var(--ds-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.__ds-tc-args-hint {
  font-size: 11px; color: var(--ds-text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: var(--ds-font-mono);
  flex: 1; min-width: 0;
}

/* 卡片折叠时的一句话内容摘要（让每张卡片一眼可区分“做了什么/对象是什么”） */
.__ds-tc-preview {
  margin: 0;
  padding: 7px 12px 8px;
  font-family: var(--ds-font-mono);
  font-size: 10.5px; line-height: 1.5;
  color: var(--ds-text-2);
  background: var(--ds-surface-2);
  border-top: 1px solid var(--ds-border);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  cursor: pointer;
}
.__ds-tc-preview::before {
  content: '↳ ';
  color: var(--ds-text-faint);
}
.__ds-tool-card-wrap[data-open="1"] .__ds-tc-preview { display: none; }

.__ds-tc-badge {
  font-family: var(--ds-font-mono);
  font-size: 9px; font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 5px;
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 4px;
}
.__ds-tc-badge--running { color: var(--ds-info); background: var(--ds-info-soft); }
.__ds-tc-badge--success { color: var(--ds-success); background: var(--ds-success-soft); }
.__ds-tc-badge--error   { color: var(--ds-error);   background: var(--ds-error-soft); }
.__ds-tc-badge--pending { color: var(--ds-text-3); background: var(--ds-surface-3); }

.__ds-tc-spinner {
  width: 9px; height: 9px;
  border: 1.5px solid color-mix(in srgb, var(--ds-info) 30%, transparent);
  border-top-color: var(--ds-info);
  border-radius: 50%;
  animation: __ds_tc_spin 0.8s linear infinite;
}
@keyframes __ds_tc_spin { to { transform: rotate(360deg); } }

.__ds-tc-time {
  font-family: var(--ds-font-mono);
  font-size: 10px; color: var(--ds-text-faint);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.__ds-tc-caret {
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: var(--ds-text-3);
  transition: transform 0.18s;
  flex-shrink: 0;
}
.__ds-tool-card-wrap[data-open="1"] .__ds-tc-caret { transform: rotate(90deg); }

.__ds-tool-card-body {
  display: none;
  padding: 10px 12px 12px;
  background: var(--ds-surface);
  font-size: 12px;
  line-height: 1.6;
}
.__ds-tool-card-wrap[data-open="1"] .__ds-tool-card-body { display: block; }

.__ds-tc-section { margin-top: 8px; }
.__ds-tc-section:first-child { margin-top: 0; }
.__ds-tc-section-title {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--ds-text-3);
  margin-bottom: 4px;
}
.__ds-tc-pre {
  margin: 0; padding: 8px 10px;
  background: var(--ds-inset);
  border: 1px solid var(--ds-border);
  border-radius: 8px;
  font-family: var(--ds-font-mono);
  font-size: 11px;
  line-height: 1.5;
  color: var(--ds-text-2);
  white-space: pre-wrap; word-break: break-all;
  max-height: 55vh; overflow: auto;
}
.__ds-tc-pre--result { color: var(--ds-text); }
.__ds-tc-pre--error  { color: var(--ds-error); background: var(--ds-error-soft); border-color: color-mix(in srgb, var(--ds-error) 30%, transparent); }

.__ds-tc-summary {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px; color: var(--ds-text-2);
  background: var(--ds-surface-2);
  border: 1px solid var(--ds-border);
  font-family: var(--ds-font-mono);
  margin-top: 4px;
}

/* 多个工具调用的容器（整段重建的折叠组：常态收起，点击组头展开） */
.__ds-tool-cards-batch {
  margin: 8px 0 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.__ds-tool-cards-batch__head {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 600;
  color: var(--ds-text-3);
  letter-spacing: 0.02em;
  padding: 4px 6px;
  cursor: pointer;
  user-select: none;
  border: 1px solid var(--ds-border);
  border-radius: 9px;
  background: var(--ds-surface-2);
  transition: background var(--ds-ease);
}
.__ds-tool-cards-batch__head:hover { background: var(--ds-surface-3); }
.__ds-tool-cards-batch__title { color: var(--ds-text-2); }
.__ds-tool-cards-batch__count {
  font-family: var(--ds-font-mono); font-size: 10px;
  background: var(--ds-accent-soft); color: var(--ds-accent-text);
  padding: 1px 7px; border-radius: 5px;
  font-weight: 700;
}
.__ds-tool-cards-batch__names {
  flex: 1; min-width: 0;
  font-family: var(--ds-font-mono); font-size: 10px;
  color: var(--ds-text-3);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-align: right;
}
.__ds-tool-cards-batch[data-open="0"] .__ds-tool-cards-batch__body { display: none; }
.__ds-tool-cards-batch[data-open="1"] .__ds-tc-caret { transform: rotate(90deg); }
.__ds-tool-cards-batch__body { display: flex; flex-direction: column; gap: 6px; padding: 4px 2px; }

/* ============================================================
   原始工具标签文本 — 视觉隐藏但保留 innerText（解析器依赖）
   ============================================================ */
.__ds-raw-toolcall {
  visibility: hidden;
  font-size: 0;
  line-height: 0;
  height: 0;
  display: block;
  overflow: hidden;
}

/* ============================================================
   Toast — 面板内即时反馈（按钮操作提示）
   ============================================================ */
.__ds-toast {
  position: absolute;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%) translateY(6px);
  max-width: 86%;
  padding: 6px 14px;
  border-radius: 9px;
  font-size: var(--ds-fs-xs);
  font-weight: 600;
  color: var(--ds-text);
  background: var(--ds-surface);
  border: 1px solid var(--ds-border-strong);
  box-shadow: var(--ds-shadow-2);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s var(--ds-ease), transform 0.18s var(--ds-ease);
  z-index: 5;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.__ds-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.__ds-toast--success {
  color: var(--ds-success);
  border-color: color-mix(in srgb, var(--ds-success) 45%, transparent);
  background: var(--ds-success-soft);
}
.__ds-toast--error {
  color: var(--ds-error);
  border-color: color-mix(in srgb, var(--ds-error) 45%, transparent);
  background: var(--ds-error-soft);
}
.__ds-toast--info {
  color: var(--ds-accent-text);
  border-color: color-mix(in srgb, var(--ds-accent) 45%, transparent);
  background: var(--ds-accent-soft);
}
`;
  s.textContent = css;
  document.head.appendChild(s);
}

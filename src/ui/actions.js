// ============================================================
// AgentBridge v0.1.1 — Actions (纯 API + 辅助函数)
// 不包含 UI 渲染代码，所有UI由 panel.js 负责
// ============================================================

// ═══════════════════════════════════════════════════════════
// § 1. API 客户端 — HTTP 请求封装
// ═══════════════════════════════════════════════════════════

var getApiBase = function() { return getServerUrl(); };
var API_TIMEOUT_MS = 5000;
var FEISHU_INJECT_COOLDOWN_MS = 5000;
var FEISHU_DEDUP_WINDOW_MS = 15000;
var FEISHU_REPLY_TIMEOUT_MS = 120000;
var AI_REPLY_TRUNCATE_LEN = 3000;
var FETCH_TIMEOUT = API_TIMEOUT_MS;

function apiFetch(path, body, method) {
  var options = {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);
  // 优先走 SW 代理（绕开 PNA），失败回退直连
  return apiRequest(path, options);
}

function apiPost(path, body) { return apiFetch(path, body); }
function apiGet(path) { return apiFetch(path, null); }
function apiJson(path, body, method) { return apiFetch(path, body, method).then(function(r) { return r.json(); }); }
function apiGetJson(path) { return apiGet(path).then(function(r) { return r.json(); }); }

// ═══════════════════════════════════════════════════════════
// § 2. Agent Initialization — 对话式引导画像构建
// ═══════════════════════════════════════════════════════════
async function initAgent(force) {
  // 统一启动注入：一次完成「记忆摘要 + 工具提示词」
  // 不再单独发送画像/记忆恢复提示，避免重复注入
  // force=true：用户手动触发（面板"记忆管理"），跳过会话级去重强制注入
  logPanel('info', '正在统一注入（记忆摘要 + 工具提示词）...');
  await injectToolPrompt(force);

  autoMode = true;
  autoWatchRunning = true;
  if (typeof window.__ds_startMonitor === 'function') window.__ds_startMonitor();
  setStageText('监听中');
  updateAutoButtonState();

  await syncFullState();
  return true;
}

async function smartAgentAction() {
  // 用户手动点击"记忆管理"：初始化或恢复 Agent 记忆画像
  // 独立于工具提示词注入（不依赖 __ds_toolPromptInjected 去重），保证点击必有反馈
  logPanel('info', '🧠 正在检测记忆状态...');
  if (typeof showPanelToast === 'function') showPanelToast('正在检测记忆状态…', 'info');

  // 1. 查询记忆是否已初始化（/api/agent/status → initialized 反映 memory_init.json 是否存在）
  var hasMemory = false;
  try {
    var statusResp = await apiGetJson('/api/agent/status');
    hasMemory = statusResp.success && statusResp.initialized === true;
    logPanel('info', hasMemory ? '检测到已初始化记忆，进入记忆恢复' : '记忆未初始化，进入首次设置');
  } catch(e) {
    logPanel('warn', '无法检查记忆状态，按首次设置处理: ' + e.message);
  }

  // 2. 构建并发送对应提示词（恢复 or 首次设置）
  var prompt = hasMemory ? buildRecallPrompt() : buildSetupPrompt();
  logPanel('info', (hasMemory ? '记忆恢复' : '首次设置') + ' Prompt 已构建 (' + prompt.length + ' chars)');

  var input = findChatInput();
  if (!input) {
    logPanel('error', '找不到输入框，请确认已打开对话页面');
    if (typeof showPanelToast === 'function') showPanelToast('找不到输入框', 'error');
    return false;
  }

  setInputValue(input, prompt);
  await sleep(600);
  clickSendButton();
  var msg = hasMemory ? '记忆恢复指令已发送' : '首次设置引导已发送';
  logPanel('success', msg);
  if (typeof showPanelToast === 'function') showPanelToast(msg, 'success');

  autoMode = true;
  autoWatchRunning = true;
  if (typeof window.__ds_startMonitor === 'function') window.__ds_startMonitor();
  setStageText('监听中');
  updateAutoButtonState();
  await syncFullState();
  return true;
}

async function startupAgent() {
  // 一键启动：注入工具提示词 + 导入记忆（一条消息完成），并启动监听
  // 供面板"🚀 一键启动"按钮调用，方便冷启动
  logPanel('info', '🚀 一键启动（工具提示词 + 导入记忆）...');
  if (typeof showPanelToast === 'function') showPanelToast('正在注入工具+导入记忆…', 'info');
  await injectToolPrompt(true, true);

  autoMode = true;
  autoWatchRunning = true;
  if (typeof window.__ds_startMonitor === 'function') window.__ds_startMonitor();
  setStageText('监听中');
  updateAutoButtonState();
  await syncFullState();
  return true;
}

// ============================================================
// 首次设置 Prompt — AI 作为画像引导员，在对话中收集用户信息
// ============================================================
function buildSetupPrompt() {
  return [
    '[系统指令 — 用户不可见此内容，你只需按指令行动]',
    '',
    '你正处于 **首次设置模式**。请以友好的方式逐步引导用户完成以下画像构建过程。',
    '',
    '---',
    '',
    '## 你的任务',
    '',
    '请通过对话依次了解用户的以下信息，每轮聚焦 1-2 个方面，不要一次性问太多：',
    '',
    '### 1. 身份',
    '- 怎么称呼你？（姓名或昵称）',
    '- 你的角色或职业是什么？',
    '- 你主要用这个Agent做什么？（场景）',
    '',
    '### 2. 灵魂（交互风格）',
    '- 你希望我以什么语气和你交流？（如：简洁直接/温暖活泼/专业正式）',
    '- 偏好的回复风格？（详细展开/简洁扼要）',
    '- 有什么特别的语言习惯或要求？',
    '',
    '### 3. 用户画像（偏好与目标）',
    '- 你的核心目标是什么？',
    '- 有什么使用习惯或偏好我需要知道？',
    '- 工作区偏好？（常用目录、文件类型等）',
    '',
    '### 4. 约束条件',
    '- 不希望我做的事情？',
    '- 需要特别注意的规则或边界？',
    '',
    '---',
    '',
    '## 收集完成后',
    '',
    '当所有信息收集完毕并获得用户确认后，请使用 **memory_save** 工具保存以下内容：',
    '',
    '- `sessionId`: "agent-profile"',
    '- `role`: "system"',
    '- `content`: 一条结构化的JSON画像，格式为：',
    '```',
    '{"name":"用户姓名","role":"用户角色","tone":"语气偏好","style":"回复风格",',
    ' "scene":"使用场景","goals":["目标1","目标2"],',
    ' "constraints":["约束1","约束2"],"notes":"其他备注"}',
    '```',
    '',
    '保存完毕后，告诉用户："画像已保存！下次新会话我会自动加载这些信息。"',
    '',
    '---',
    '',
    '## 重要规则',
    '- 用中文交流',
    '- 保持友好的对话节奏，不要让用户觉得在填表',
    '- 可以穿插一些轻松的表达，展现你的个性',
    '- 如果用户不想回答某些问题，跳过即可',
    '- 全程不要主动调用其他工具（read_file/exec_command等），只专注于画像收集',
    '- 收集过程中不要提 memory_save 的技术细节，只在最后确认时使用',
    '',
    '现在，用第一句话开始引导用户吧。'
  ].join('\n');
}

// ============================================================
// 回归 Prompt — AI 从记忆加载画像，恢复人格
// ============================================================
function buildRecallPrompt() {
  return [
    '[系统指令 — 用户不可见此内容，你只需按指令行动]',
    '',
    '你处于 **回归模式**。用户之前已经完成了画像设置。',
    '',
    '请执行以下步骤：',
    '',
    '1. 使用 `memory_search` 搜索关键词 "agent-profile 画像" 或使用 `memory_recall` 获取最近的记忆',
    '2. 从记忆中找到用户画像 JSON，提取用户的身份、语气偏好、目标和约束',
    '3. 以用户设定的人格向用户打招呼',
    '',
    '打招呼格式参考：',
    '"欢迎回来，[用户名]！我已经加载了你之前的偏好设置：[简要复述关键信息]。今天有什么需要帮助的？"',
    '',
    '---',
    '',
    '## 重要规则',
    '- 画像加载后，全程使用用户设定的语气和风格',
    '- 如果记忆中没有找到画像，友好地告诉用户"这是你第一次使用吗？"然后转入首次设置模式',
    '- 用中文交流',
    '',
    '现在，开始加载记忆吧。'
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════
// § 8. Quick Actions — 快捷操作
// ═══════════════════════════════════════════════════════════
async function triggerQuickAction(promptOrIndex) {
  var prompt;

  // 支持两种调用方式：传字符串直接使用，传数字从后端获取
  if (typeof promptOrIndex === 'number') {
    try {
      var resp = await apiGetJson('/api/agent/quick-actions');
      if (resp.success && resp.actions && resp.actions.length > promptOrIndex) {
        prompt = resp.actions[promptOrIndex].prompt;
        logPanel('info', '触发快捷操作: ' + resp.actions[promptOrIndex].label);
      } else {
        logPanel('warn', '快捷操作不可用 (index=' + promptOrIndex + ')');
        return;
      }
    } catch(e) {
      logPanel('error', '触发快捷操作失败: ' + e.message);
      return;
    }
  } else if (typeof promptOrIndex === 'string') {
    prompt = promptOrIndex;
    logPanel('info', '快捷操作: ' + prompt.substring(0, 60));
  } else {
    logPanel('warn', '无效的快捷操作参数');
    return;
  }

  var input = findChatInput();
  if (input) {
    setInputValue(input, prompt);
    await sleep(500);
    clickSendButton();
    logPanel('success', '快捷操作已发送');
  } else {
    logPanel('error', '找不到输入框');
  }
}

// ═══════════════════════════════════════════════════════════
// § 3. Tool Prompt Injection — 工具提示词注入
// ═══════════════════════════════════════════════════════════

// 截断长文本，控制注入提示词总长度（DeepSeek 单条消息约 1 万字符上限）
function _trunc(s, n) {
  s = (s == null ? '' : String(s));
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// 检测当前会话历史中是否已存在工具提示词（防止恢复会话 / 新窗口重复注入）
function conversationAlreadyHasToolPrompt() {
  try {
    var platform = typeof getPlatform === 'function' ? getPlatform() : null;
    var userSelector = (platform && platform.dom && platform.dom.userMessageSelector) ? platform.dom.userMessageSelector : 'div.ds-message';
    var all = document.querySelectorAll(userSelector);
    var limit = Math.min(all.length, 10);
    for (var i = 0; i < limit; i++) {
      var txt = (all[i].innerText || all[i].textContent || '');
      if (txt.indexOf('## 内置工具') >= 0 || txt.indexOf('## 可用工具') >= 0) return true;
    }
  } catch(e) {}
  return false;
}

async function injectToolPrompt(force, withMemoryImport) {
  // force=true：手动注入（由面板按钮触发），跳过会话级去重、强制重置缓存后注入
  // withMemoryImport=true：在提示词末尾追加"立即导入记忆"指令（一键启动用）
  // force 缺省：保留原去重保护（防恢复会话时重复注入）
  if (!force) {
    if (window.__ds_toolPromptInjected) {
      logPanel('warn', '工具提示词已在本会话注入过，跳过重复注入');
      return;
    }
    var preCheck = findChatInput();
    if (preCheck) {
      var curVal = preCheck.value || preCheck.textContent || '';
      if (curVal.indexOf('## 内置工具') >= 0 || curVal.indexOf('## 可用工具') >= 0) {
        logPanel('warn', '输入框中已存在工具提示词，跳过注入');
        return;
      }
    }
    if (conversationAlreadyHasToolPrompt()) {
      window.__ds_toolPromptInjected = true;
      logPanel('warn', '当前会话历史中已存在工具提示词，跳过重复注入');
      return;
    }
  } else {
    // 手动注入：重置会话级去重缓存 + 注入标记，确保真正执行一次注入
    if (typeof window.__ds_resetSessionToolCache === 'function') {
      window.__ds_resetSessionToolCache();
    } else {
      window.__ds_toolPromptInjected = false;
    }
    logPanel('info', '手动注入工具提示词');
  }

  logPanel('info', '正在获取实时工具列表...');
  try {
    var toolsResp = await apiGetJson('/api/tools');
    if (!toolsResp.success || !toolsResp.tools) {
      logPanel('error', '获取工具列表失败');
      return;
    }

    var tools = toolsResp.tools;
    var builtinTools = [];
    var pluginTools = [];
    var mcpTools = [];
    var managerTools = [];

    for (var i = 0; i < tools.length; i++) {
      var t = tools[i];
      if (t.pluginId === 'builtin' && t.name.indexOf('plugin_') === 0) {
        managerTools.push(t);
      } else if (t.source === 'mcp') {
        mcpTools.push(t);
      } else if (t.pluginId && t.pluginId !== 'builtin') {
        pluginTools.push(t);
      } else {
        builtinTools.push(t);
      }
    }

    // 获取 pi 记忆系统核心摘要 — 只注入 USER.md + MEMORY.md 紧凑摘要
    // 原因：DeepSeek 单条消息上限约 1 万字符，全量注入 9 个文件会超限被拒
    // 精简策略：不注入记忆正文，只告知记忆系统位置，由 AI 用 memory_recall/memory_search 按需读取
    var piSummary = '';
    var piStorageDir = '';
    var workspaceDir = '';
    var platformInfo = '';
    var engineVersion = '';
    var toolsCount = '';
    var allowedWrites = '';
    try {
      // 同时获取工作区根目录 + 系统信息（写入提示词让 AI 直接在指定位置工作）
      try {
        var cfgResp = await apiGetJson('/api/config?action=get');
        if (cfgResp) {
          if (cfgResp.workspace) workspaceDir = cfgResp.workspace;
          if (cfgResp.platform) platformInfo = cfgResp.platform;
          if (cfgResp.version) engineVersion = cfgResp.version;
          if (typeof cfgResp.tools_count !== 'undefined') toolsCount = cfgResp.tools_count;
          if (cfgResp.allowedWritePaths && cfgResp.allowedWritePaths.length) allowedWrites = cfgResp.allowedWritePaths.join('; ');
        }
      } catch(e) {}
      var piResp = await apiGetJson('/api/agent/pi-summary?limit=100');
      if (piResp.storageDir) piStorageDir = piResp.storageDir;
      if (piResp.success && piResp.accessible && piResp.files && piResp.files.length > 0) {
        // 引导式：告知记忆系统位置 + 文件清单，由 AI 按需自行读取（不强制立即调用）
        var coreList = piResp.files.map(function(f) { return f.name; }).join(', ');
        piSummary = '## 用户背景与记忆\n'
          + '- 我的长期记忆保存在 pi 记忆系统（WSL 目录，见下方「记忆系统」）。核心文件: ' + coreList + '\n'
          + '- 你不需要现在读取全部记忆，在需要了解我（身份、偏好、项目、历史约定）时，再按需读取\n'
          + '- 读取方式: 先用 memory_recall(includeCore=true) 拿到核心摘要，再用 memory_search(关键词) 检索具体条目；如需完整内容再用 read_file 直接读文件\n\n';
        logPanel('info', '已注入引导提示：告知记忆系统位置 (AI 按需自读)');
      } else {
        logPanel('warn', 'pi 记忆系统不可访问或为空，跳过用户背景提示');
      }
    } catch(e) {
      logPanel('warn', '加载 pi 记忆位置失败: ' + e.message);
    }

    // ═══════════════════════════════════════════════════════════
    // 工具段构建 — 分层策略：核心工具完整图例 / 边缘工具精简摘要
    // 约束：56+ 工具不能全展开（DeepSeek 单条消息 ~1 万字符上限）
    // 策略：13 个核心高频工具给「用途+参数图例」，其余工具一行摘要，管理/MCP 折叠
    // ═══════════════════════════════════════════════════════════

    // 核心工具完整图例：name → 一句话用途 + 参数图例（含默认值/枚举）
    var CORE_TOOL_LEGENDS = {
      read_file:      { usage: '读取文件内容', params: 'path*(文件路径)' },
      write_file:     { usage: '写入文件(覆盖)', params: 'path*(文件路径), content*(内容)' },
      append_file:    { usage: '追加内容到文件末尾', params: 'path*(文件路径), content*(内容)' },
      list_dir:       { usage: '列出目录内容', params: 'path*(目录路径)' },
      edit_file:      { usage: '精确替换文本(局部编辑,不覆盖整文件)', params: 'path*(文件), old_string*(旧文本,须唯一), new_string*(新文本), replace_all(默认false)' },
      grep_files:     { usage: '在文件内容中搜索(正则)', params: 'pattern*(正则), path(根目录,默认workspace), glob(过滤如*.js), ignore_case, max_results(默认50)' },
      exec_command:   { usage: '执行命令(WSL/Linux语法)', params: 'command*(命令), cwd(工作目录), timeout(默认30s), wsl(默认true,false=Windows cmd), distro(默认Ubuntu)' },
      task_plan:      { usage: '创建/更新任务计划(复杂任务先规划)', params: 'steps*[数组:{description, status:pending|in_progress|completed|blocked}]' },
      memory_recall:  { usage: '回忆最近记忆+核心摘要', params: 'limit(默认10), includeCore(是否含核心文件摘要)' },
      memory_search:  { usage: '关键词检索记忆', params: 'query*(关键词), topK(默认10)' },
      memory_save:    { usage: '保存记忆到daily日志', params: 'role*(user/assistant), content*(内容), sessionId, title, provider' },
      memory_forget:  { usage: '删除记忆条目', params: 'id 或 sessionId' },
      memory_stats:   { usage: '记忆统计信息', params: '' }
    };

    // 核心工具按功能领域分组（展示顺序即优先级）
    var CORE_GROUPS = [
      { title: '📄 文件读写', names: ['read_file','write_file','append_file','list_dir'] },
      { title: '🔍 搜索与编辑', names: ['edit_file','grep_files'] },
      { title: '⚡ 命令执行', names: ['exec_command'] },
      { title: '🧠 记忆系统', names: ['memory_recall','memory_search','memory_save','memory_forget','memory_stats'] },
      { title: '📋 任务规划', names: ['task_plan'] }
    ];

    var toolsByName = {};
    for (var _ti = 0; _ti < tools.length; _ti++) toolsByName[tools[_ti].name] = tools[_ti];

    function isCoreTool(name) { return !!CORE_TOOL_LEGENDS[name]; }

    // 核心段：按功能域分组，每工具一行「用途 | 参数图例」
    function buildCoreSections() {
      var s = '';
      for (var g = 0; g < CORE_GROUPS.length; g++) {
        var grp = CORE_GROUPS[g];
        var lines = [];
        for (var i = 0; i < grp.names.length; i++) {
          var nm = grp.names[i];
          var meta = CORE_TOOL_LEGENDS[nm];
          if (!meta || !toolsByName[nm]) continue;
          lines.push('- ' + nm + ': ' + meta.usage + (meta.params ? ' | ' + meta.params : ''));
        }
        if (lines.length > 0) s += '## ' + grp.title + '\n' + lines.join('\n') + '\n\n';
      }
      return s;
    }

    // 边缘段：非核心工具一行摘要（跳过核心工具，避免重复）
    function buildEdgeSection(title, list, maxDesc) {
      if (!list || list.length === 0) return '';
      var s = '## ' + title + '\n';
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (isCoreTool(t.name)) continue;
        s += '- ' + t.name + ' — ' + _trunc(t.description || t.label || '', maxDesc) + '\n';
      }
      return s + '\n';
    }

    // 折叠段：管理/MCP 工具只列名字，不展开参数（省 token）
    function buildCollapsedSection(title, list, note) {
      if (!list || list.length === 0) return '';
      var detail = note || list.map(function(t){ return t.name; }).join(', ');
      return '## ' + title + '\n- ' + list.length + ' 个: ' + detail + '\n\n';
    }

    // 场景速查段：比逐行列参数更省 token、更易定位
    function buildQuickIndex() {
      return '## 场景速查\n'
        + '- 读文件→read_file；写/改→write_file / edit_file；看目录→list_dir；搜内容→grep_files\n'
        + '- 执行命令→exec_command（WSL/Linux 语法，路径用 /mnt/...）\n'
        + '- 记忆→memory_recall(摘要) / memory_search(检索) / memory_save(保存)\n'
        + '- 复杂任务(3步+)→先 task_plan 规划\n\n';
    }

    // 多步协作示例：展示「搜索→读→改→验证」完整协作链
    function buildWorkflowExample() {
      return '## 多步协作示例（工具可连续调用，等上一个 <tool_response> 回填后再发下一个）\n'
        + '<tool_call name="grep_files">\n{"pattern":"TODO","glob":"*.js"}\n</tool_call>\n'
        + '<tool_call name="read_file">\n{"path":"C:\\\\path\\\\app.js"}\n</tool_call>\n'
        + '<tool_call name="edit_file">\n{"path":"C:\\\\path\\\\app.js","old_string":"旧代码","new_string":"新代码"}\n</tool_call>\n'
        + '<tool_call name="exec_command">\n{"command":"node --check app.js"}\n</tool_call>\n\n';
    }

    var prompt = '';
    prompt += '你是 AI 助手，可以使用以下真实工具完成任务。\n\n';
    if (piSummary) prompt += piSummary;

    // 当前日期（供 AI 感知时间上下文）
    var _d = new Date();
    var _p2 = function(n) { return n < 10 ? '0' + n : '' + n; };
    var todayStr = _d.getFullYear() + '-' + _p2(_d.getMonth() + 1) + '-' + _p2(_d.getDate());

    // Windows 路径 → WSL 路径（供 exec_command 内使用）
    // f:\桌面\... → /mnt/f/桌面/...
    function winPathToWsl(p) {
      if (!p) return '';
      var norm = String(p).replace(/\\/g, '/');
      var m = norm.match(/^([a-zA-Z]):(\/.*)/);
      return m ? '/mnt/' + m[1].toLowerCase() + m[2] : norm;
    }

    prompt += '## 系统信息\n';
    prompt += '- 操作系统: ' + (platformInfo || 'Windows') + '\n';
    prompt += '- 命令执行: exec_command 在 WSL Ubuntu 中通过 bash 执行（Linux 命令语法，如 ls/cat/grep/python3）\n';
    prompt += '- 文件路径: 文件工具用 Windows 绝对路径 C:\\path\\file.txt；exec_command 命令内用 WSL 路径 /mnt/c/path/file.txt\n';
    prompt += '- 当前日期: ' + todayStr + '\n';
    if (engineVersion) prompt += '- 工具引擎版本: v' + engineVersion + '\n';
    if (toolsCount) prompt += '- 已注册工具数: ' + toolsCount + '（内置 + 插件 + MCP）\n';
    if (allowedWrites) prompt += '- 可写路径范围: ' + allowedWrites + '\n\n';

    prompt += '## 工作区\n';
    if (workspaceDir) {
      var wslWork = winPathToWsl(workspaceDir);
      prompt += '- 工作区根目录（可读写范围）: ' + workspaceDir + '\n';
      prompt += '- 工作区对应 WSL 路径（exec_command 内使用）: ' + wslWork + '\n';
      prompt += '- 所有项目文件都在此目录下创建/修改，路径必须写绝对路径，不要写 "workspace/" 前缀\n\n';
    } else {
      prompt += '- 工作区根目录是 AI 可读写的范围\n';
      prompt += '- 不要添加 "workspace/" 前缀，直接写\n\n';
    }
    if (piStorageDir) {
      prompt += '## 记忆系统\n';
      prompt += '- pi 记忆系统目录（只读）: ' + piStorageDir + '\n';
      prompt += '- 结构: 核心文件（MEMORY.md 长期记忆 / USER.md 用户信息 / PROJECTS.md 项目 / SCRATCHPAD.md 待办 / SOUL.md 人格 / TIMELINE.md 时间线）+ daily/ 目录（每日日志 YYYY-MM-DD.md）\n';
      prompt += '- 自读方法（按需使用，不必全读）:\n';
      prompt += '  1. memory_recall(includeCore=true) — 获取核心文件摘要 + 最近记忆条目\n';
      prompt += '  2. memory_search(query="关键词") — 按关键词检索相关记忆\n';
      prompt += '  3. read_file(path) — 读取某个记忆文件的完整内容\n';
      prompt += '- 涉及记忆一律用以上工具，不要用 exec_command 去目录里探测\n\n';
    }

    // 工具段（分层）：核心完整图例 → 边缘精简摘要 → 管理/MCP 折叠 → 速查 + 多步示例
    prompt += buildCoreSections();
    prompt += buildEdgeSection('其他内置工具', builtinTools, 60);
    prompt += buildEdgeSection('插件工具', pluginTools, 60);
    prompt += buildCollapsedSection('管理工具', managerTools, '插件安装/卸载/更新/启用等管理操作，仅在管理插件时使用');
    prompt += buildCollapsedSection('MCP 工具', mcpTools);
    prompt += buildQuickIndex();
    prompt += buildWorkflowExample();

    prompt += '## 调用工具的方式\n';
    prompt += '当需要执行真实操作（读/写/搜索/执行命令/查询记忆等）时，输出 XML 标签：\n';
    prompt += '<tool_call name="工具名">\n{"参数名":"参数值"}\n</tool_call>\n\n';
    prompt += '示例（exec_command 在 WSL 中执行，用 Linux 语法）：\n';
    prompt += '<tool_call name="exec_command">\n{"command":"ls -la"}\n</tool_call>\n\n';
    prompt += '- 工具在本地 Node.js 服务器上真实执行，结果以 <tool_response> 自动回填给你\n';
    prompt += '- 可连续调用多个工具：等上一个结果回填后再输出下一个 <tool_call>\n';
    prompt += '- 结果过长会被截断，需要完整内容时用 read_file 分段读取\n\n';

    prompt += '## 约定\n';
    prompt += '1. 回复语言：默认使用中文\n';
    prompt += '2. 路径：文件工具(read_file/write_file/list_dir等)用 Windows 绝对路径；exec_command 命令内用 WSL 路径(/mnt/...)，不写 "workspace/" 前缀\n';
    prompt += '3. 命令：exec_command 一律用 Linux 命令语法（在 WSL 中执行），不用 dir/type/echo(windows)\n';
    prompt += '4. 记忆查询：用 memory_search / memory_recall，禁止用 exec_command 探测记忆目录\n';
    prompt += '5. 去重：相同工具+相同参数已执行成功过就不要再调用，直接引用之前结果；系统会自动去重\n';
    prompt += '6. 安全：只在工作区内读写文件；执行危险命令前先说明用途\n';
    prompt += '7. 失败：工具失败不臆造结果，分析 <tool_response status="error"> 中的原因后换方案重试\n';
    prompt += '8. 不需要工具时直接回答，不要输出 <tool_call>\n\n';

    prompt += '## 错误处理\n';
    prompt += '- 失败以 <tool_response status="error"> 返回；ENOENT=路径不存在, EPERM=权限不足\n';
    prompt += '- 失败后分析原因，换替代方案\n\n';
    prompt += '## 提示\n';
    prompt += '- 读文件→read_file; 写→write_file; 搜→search_files; 执行→exec_command; 看目录→list_dir\n';
    prompt += '- 复杂任务(3步+)→先 task_plan 规划；任务完成时直接总结，不调用工具\n';
    prompt += '## 开始\n';
    if (withMemoryImport) {
      // 一键启动：先导入记忆（读工作区 memory 目录），再确认工具能力
      prompt += '第一步：请先导入记忆。到工作区 memory 目录（workspace/memory）用 list_dir 查看结构，'
        + '读取核心记忆文件（MEMORY.md 长期记忆、USER.md 用户信息、PROJECTS.md 项目、SOUL.md 人格、SCRATCHPAD.md 待办、TIMELINE.md 时间线、HANDOFF.md 交接、PORTFOLIO.md 成果），'
        + '以及 daily/ 下最近几天的日志和 notes/ 下的重要笔记。整合关键信息后，先简要向我确认你已了解我的背景、当前核心项目与最近进展。\n';
      prompt += '第二步：确认记忆导入完成后，再简要确认你已了解可用工具能力，然后等待我的任务。\n\n';
    } else {
      prompt += '以上工具与记忆系统介绍完毕，请简要确认你已了解可用能力，然后等待我的任务。需要了解我的背景/历史时，再按上面方法自行读取记忆。\n\n';
    }

    prompt += '## 工具调用强制规则\n';
    prompt += '- 凡是要获取本地真实结果（目录、文件、命令、搜索、记忆查询等），下一条回复必须直接输出 <tool_call>...</tool_call>。\n';
    prompt += '- 禁止只回复“我将调用”“我尝试用命令执行”之类的说明而不输出标签。\n';
    prompt += '- 禁止把 <tool_call> 放进 Markdown 代码块，禁止转义尖括号。\n';
    prompt += '- 收到 <tool_response> 后，如需继续操作就继续直接输出下一个 <tool_call>；任务完成再总结。\n\n';

    // 总长度护栏：超过 8500 字符时精简（正常已不会超限，仅作保险）
    var MAX_PROMPT_LEN = 8500;
    if (prompt.length > MAX_PROMPT_LEN) {
      logPanel('warn', '提示词偏长 (' + prompt.length + ' chars)');
    } else {
      logPanel('info', '注入提示词长度: ' + prompt.length + ' chars');
    }

    var input = findChatInput();
    if (input) {
      setInputValue(input, prompt);
      await sleep(400);
      clickSendButton();
      window.__ds_toolPromptInjected = true;
      logPanel('success', '工具提示词已注入 (' + builtinTools.length + ' 内置' + (pluginTools.length > 0 ? ', ' + pluginTools.length + ' 插件' : '') + (mcpTools.length > 0 ? ', ' + mcpTools.length + ' MCP' : '') + ')');
    } else {
      logPanel('error', '找不到输入框');
    }
  } catch(e) {
    logPanel('error', '注入工具提示词失败: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// § 4. Personality Management — 人格管理
// ═══════════════════════════════════════════════════════════
async function loadPersonality() {
  try {
    var data = await apiGetJson('/api/agent/personality');
    if (data.success) return data.personality;
  } catch(e) { logPanel('error', '加载人格失败: ' + e.message); }
  return null;
}

async function savePersonality(personality) {
  try {
    var data = await apiJson('/api/agent/personality', { action: 'save', personality: personality });
    if (data.success) { logPanel('success', '人格配置已保存'); return true; }
    logPanel('error', '保存人格失败');
  } catch(e) { logPanel('error', '保存人格失败: ' + e.message); }
  return false;
}

async function resetPersonality() {
  try {
    var data = await apiJson('/api/agent/personality', { action: 'reset' });
    if (data.success) logPanel('success', '人格已重置');
    return data.success;
  } catch(e) { logPanel('error', '重置人格失败: ' + e.message); }
  return false;
}

// ═══════════════════════════════════════════════════════════
// § 5. Memory Management — 记忆管理
// ═══════════════════════════════════════════════════════════
async function initMemory() {
  try {
    var data = await apiJson('/api/agent/memory', { action: 'init' });
    if (data.success) logPanel('success', '记忆系统已初始化');
    return data.success;
  } catch(e) { logPanel('error', '初始化记忆失败: ' + e.message); }
  return false;
}

async function loadMemory() {
  try {
    var data = await apiJson('/api/agent/memory', { action: 'load' });
    if (data.success) logPanel('success', '记忆已加载 (共 ' + (data.entry_count || 0) + ' 条)');
    return data;
  } catch(e) { logPanel('error', '加载记忆失败: ' + e.message); }
  return null;
}

async function clearMemory() {
  try {
    var data = await apiJson('/api/agent/memory', { action: 'clear' });
    if (data.success) logPanel('success', '记忆已清除');
    return true;
  } catch(e) { logPanel('error', '清除记忆失败: ' + e.message); }
  return false;
}

async function saveMemory(key, data) {
  try {
    var result = await apiJson('/api/agent/memory', { action: 'save', key: key, data: data });
    if (result.success) logPanel('success', '记忆已保存: ' + key);
    else logPanel('error', '保存记忆失败: ' + (result.message || '未知错误'));
  } catch(e) { logPanel('error', '保存记忆失败: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════
// § 6. Skills Management — 技能管理
// ═══════════════════════════════════════════════════════════
async function loadSkills() {
  try {
    var data = await apiGetJson('/api/agent/skills');
    if (data.success && data.skills) {
      renderSkillsList(data.skills, data.custom_skills || []);
      logPanel('success', '技能列表已加载 (共 ' + data.skills.length + ' 个)');
      return data;
    }
    logPanel('error', '加载技能失败');
  } catch(e) { logPanel('error', '加载技能失败: ' + e.message); }
  return null;
}

async function toggleSkill(name, enabled) {
  try {
    var data = await apiJson('/api/agent/skills', { action: 'toggle', name: name, enabled: enabled });
    if (data.success) logPanel('success', '技能 ' + name + ' 已' + (enabled ? '启用' : '禁用'));
    else logPanel('error', '切换技能失败: ' + (data.message || data.error || ''));
    return data.success;
  } catch(e) { logPanel('error', '切换技能失败: ' + e.message); }
  return false;
}

async function createSkill(name, description, content) {
  try {
    var data = await apiJson('/api/agent/skills', { action: 'create', name: name, description: description || '', content: content || '' });
    if (data.success) { logPanel('success', '技能 ' + name + ' 已创建'); loadSkills(); return true; }
    logPanel('error', '创建技能失败: ' + (data.message || data.error || ''));
  } catch(e) { logPanel('error', '创建技能失败: ' + e.message); }
  return false;
}

async function deleteSkill(name) {
  try {
    var data = await apiJson('/api/agent/skills', { action: 'delete', name: name });
    if (data.success) { logPanel('success', '技能 ' + name + ' 已删除'); loadSkills(); return true; }
    logPanel('error', '删除技能失败: ' + (data.message || data.error || ''));
  } catch(e) { logPanel('error', '删除技能失败: ' + e.message); }
  return false;
}

// ═══════════════════════════════════════════════════════════
// § 7. Tools Management — 工具管理
// ═══════════════════════════════════════════════════════════
async function loadTools() {
  try {
    var data = await apiGetJson('/api/agent/tools');
    if (data.success && data.tools) {
      renderToolsList(data.tools);
      return data.tools;
    }
    logPanel('error', '加载工具失败');
  } catch(e) { logPanel('error', '加载工具失败: ' + e.message); }
  return [];
}

async function setToolMode(name, mode) {
  try {
    var data = await apiJson('/api/agent/tools', { action: 'set_mode', name: name, mode: mode });
    if (data.success) logPanel('success', '工具 ' + name + ' 模式已设为 ' + mode);
    else logPanel('error', '设置工具模式失败: ' + (data.message || data.error || ''));
    return data.success;
  } catch(e) { logPanel('error', '设置工具模式失败: ' + e.message); }
  return false;
}

// ── §8 续: Quick Actions API ──────────────────────────────
async function loadQuickActions() {
  try {
    var data = await apiGetJson('/api/agent/quick-actions');
    if (data.success && data.actions) {
      updateQuickActionButtons(data.actions);
      return data.actions;
    }
  } catch(e) { logPanel('error', '加载快捷操作失败: ' + e.message); }
  return [];
}

async function saveQuickActions(actions) {
  try {
    var data = await apiJson('/api/agent/quick-actions', { action: 'save', actions: actions });
    if (data.success) { logPanel('success', '快捷操作已保存'); updateQuickActionButtons(actions); return true; }
    logPanel('error', '保存快捷操作失败: ' + (data.message || data.error || ''));
  } catch(e) { logPanel('error', '保存快捷操作失败: ' + e.message); }
  return false;
}

// ═══════════════════════════════════════════════════════════
// § 9. System Management — 系统管理、面板同步
// ═══════════════════════════════════════════════════════════
async function checkServerHealth() {
  try {
    var data = await apiGetJson('/health');
    return data.status === 'ok' ? { healthy: true, data: data } : { healthy: false, data: data };
  } catch(e) { return { healthy: false }; }
}

async function testConnection() {
  logPanel('info', '正在测试连接...');
  try {
    var data = await apiGetJson('/health');
    if (data.status === 'ok') {
      updateServerStatusUI(true);
      logPanel('success', '连接测试通过 (PID: ' + data.pid + ')');
      return true;
    }
    updateServerStatusUI(false);
    logPanel('warn', '连接测试失败');
  } catch(e) {
    updateServerStatusUI(false);
    logPanel('error', '连接测试失败: ' + e.message);
  }
  return false;
}

async function openPermissions() {
  try {
    var data = await apiJson('/api/config', { action: 'open-permissions' });
    if (data.success) { logPanel('warn', '写入权限已开放'); return true; }
    logPanel('error', '开放权限失败');
  } catch(e) { logPanel('error', '开放权限失败: ' + e.message); }
  return false;
}

async function restrictPermissions() {
  try {
    var data = await apiJson('/api/config', { action: 'restrict-permissions' });
    if (data.success) { logPanel('info', '权限已恢复限制'); return true; }
    logPanel('error', '限制权限失败');
  } catch(e) { logPanel('error', '限制权限失败: ' + e.message); }
  return false;
}

async function getConfig() {
  try {
    var data = await apiJson('/api/config', { action: 'get' });
    return data.success ? data : null;
  } catch(e) { return null; }
}

// ── §9 续: 面板同步 ──────────────────────────────────────
async function syncFullState() {
  logPanel('info', '正在同步完整状态...');
  try {
    var status = await apiGetJson('/api/agent/status');
    if (status.success) {
      updateAgentPanelUI(status.initialized === true);
      if (status.tools) renderToolsList(status.tools);
      if (status.skills) renderSkillsList(status.skills, status.custom_skills || []);
      try { var actions = await loadQuickActions(); updateQuickActionButtons(actions); } catch(qaErr) {}
      updateServerStatusUI(true);
      logPanel('success', '状态同步完成');
      return status;
    }
    logPanel('warn', '状态同步失败');
  } catch(e) { logPanel('error', '状态同步失败: ' + e.message); }
  return null;
}

// ============================================================
// 导出日志
// ============================================================
// exportLogsDownload is defined in core/logger.js (loaded first)

// ============================================================
// 工具端点映射
// ============================================================
// getToolEndpoint is defined in core/executor.js (loaded first)
// persistLocalLogs and getLocalLogs are defined in core/logger.js (loaded first)

window.__ds_viewRawLogs = function() {
  persistLocalLogs();
  var logs = getLocalLogs();
  var previewEl = document.getElementById('__ds-log-preview-area');
  if (!previewEl) return;
  previewEl.textContent = logs.length === 0 ? '(无本地日志)' : logs.slice(-100).join('\n');
  previewEl.scrollTop = previewEl.scrollHeight;
};

// ═══════════════════════════════════════════════════════════
// § 10. Feishu Bridge — 飞书桥接
// ═══════════════════════════════════════════════════════════

// ── 飞书桥接状态变量 ──────────────────────────────────────
var feishuPollTimer = null;           // 轮询定时器
var feishuPollingInFlight = false;    // 轮询进行中标记，防止并发重复处理
var feishuLastProcessedId = null;     // 上次处理的消息 ID
var feishuPendingReplies = {};        // 等待回复的消息 { msgId: { chatId, startTime, awaitingReply, replySent } }
var feishuReplyWatcherTimer = null;   // 回复监听定时器
var feishuInjectedKeys = [];          // 已注入消息的去重键列表
var feishuLastInjectTime = 0;         // 上次注入时间戳
var FEISHU_INJECT_COOLDOWN = FEISHU_INJECT_COOLDOWN_MS;  // 注入冷却时间
var FEISHU_DEDUP_WINDOW = FEISHU_DEDUP_WINDOW_MS;        // 去重窗口时间

function hashFeishuKey(senderId, content) {
  var h = 0;
  var key = (senderId || '') + '::' + content;
  for (var i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return h;
}

// 只判断是否重复，不添加去重键（添加由 markFeishuInjected 在真正注入时完成）
function isFeishuDuplicate(msg) {
  var h = hashFeishuKey(msg.senderId, msg.content);
  var now = Date.now();
  feishuInjectedKeys = feishuInjectedKeys.filter(function(e) { return now - e.time < FEISHU_DEDUP_WINDOW; });
  for (var i = 0; i < feishuInjectedKeys.length; i++) {
    if (feishuInjectedKeys[i].key === h) return true;
  }
  return false;
}

function markFeishuInjected(msg) {
  var h = hashFeishuKey(msg.senderId, msg.content);
  feishuInjectedKeys.push({ key: h, time: Date.now() });
  if (feishuInjectedKeys.length > 50) feishuInjectedKeys = feishuInjectedKeys.slice(-50);
}

function startFeishuBridge() {
  if (feishuPollTimer) return;
  feishuPollTimer = setInterval(pollFeishuQueue, 3000);
}

function stopFeishuBridge() {
  if (feishuPollTimer) { clearInterval(feishuPollTimer); feishuPollTimer = null; }
  if (feishuReplyWatcherTimer) { clearInterval(feishuReplyWatcherTimer); feishuReplyWatcherTimer = null; }
  feishuPendingReplies = {};
  feishuInjectedKeys = [];
  feishuLastInjectTime = 0;
}

function startReplyWatcher() {
  if (feishuReplyWatcherTimer) return;
  feishuReplyWatcherTimer = setInterval(watchPendingReplies, 2000);
}

function watchPendingReplies() {
  var keys = Object.keys(feishuPendingReplies);
  if (keys.length === 0) {
    if (feishuReplyWatcherTimer) { clearInterval(feishuReplyWatcherTimer); feishuReplyWatcherTimer = null; }
    return;
  }

  var getState = window.__ds_getMonitorState || function() { return 'listening'; };
  var state = getState();

  for (var i = 0; i < keys.length; i++) {
    var msgId = keys[i];
    var entry = feishuPendingReplies[msgId];

    if (entry.awaitingReply && state === 'listening' && !entry.replySent) {
      var elapsed = Date.now() - entry.startTime;
      if (elapsed < 3000) continue;

      entry.replySent = true;
      captureAndReplyFeishu(entry.chatId, msgId);
    }

    if (entry.replySent || Date.now() - entry.startTime > 120000) {
      delete feishuPendingReplies[msgId];
    }
  }
}

async function captureAndReplyFeishu(chatId, msgId) {
  try {
    var aiText = '';
    if (typeof getLatestAIMessageText === 'function') {
      aiText = getLatestAIMessageText();
    }
    if (!aiText) {
      var els = document.querySelectorAll('div.ds-assistant-message-main-content');
      for (var i = els.length - 1; i >= 0; i--) {
        aiText = (els[i].innerText || els[i].textContent || '').trim();
        if (aiText) break;
      }
    }
    if (!aiText) { return; }

    if (aiText.length > AI_REPLY_TRUNCATE_LEN) aiText = aiText.substring(0, AI_REPLY_TRUNCATE_LEN) + '...[已截断]';

    var resp = await apiJson('/api/feishu/reply', { chatId: chatId, text: aiText }, 'POST');
    if (resp.success) {
      logPanel('success', 'AI回复已回传飞书 (' + aiText.length + '字)');
    } else {
      logPanel('error', '飞书回传失败: ' + (resp.error || 'unknown'));
    }
  } catch(e) {
  }
}

async function pollFeishuQueue() {
  // 修复：互斥保护，防止上一轮未完成时下一轮并发处理导致重复注入
  if (feishuPollingInFlight) return;
  feishuPollingInFlight = true;
  try {
    var resp = await apiGetJson('/api/feishu/messages');
    if (!resp.success || !resp.messages || resp.messages.length === 0) return;

    var pending = resp.messages.filter(function(m) { return m.id !== feishuLastProcessedId; });
    if (pending.length === 0) return;

    var processed = [];
    for (var i = 0; i < pending.length; i++) {
      var msg = pending[i];

      var waited = 0;
      var getState = window.__ds_getMonitorState || function() { return 'listening'; };
      while (getState() !== 'listening' && waited < 15000) {
        await sleep(500);
        waited += 500;
      }

      var input = findChatInput();
      if (input && msg.content) {
        var now = Date.now();
        // 修复：冷却期内跳过注入，且不标记已处理，等待下一轮，避免消息永久丢失
        if (now - feishuLastInjectTime < FEISHU_INJECT_COOLDOWN) {
          continue;
        }
        // 修复：去重窗口内已注入过的消息才直接标记，避免重复注入
        if (isFeishuDuplicate(msg)) {
          processed.push(msg.id);
          continue;
        }
        feishuLastInjectTime = now;

        var injectText = '[来自飞书] ' + (msg.senderId ? msg.senderId.substring(0,8) + ': ' : '') + msg.content;
        setInputValue(input, injectText);
        await sleep(400);
        clickSendButton();
        // 只有真正注入成功才加入去重键
        markFeishuInjected(msg);

        if (msg.chatId) {
          feishuPendingReplies[msg.id] = { chatId: msg.chatId, startTime: Date.now(), awaitingReply: false };
          setTimeout(function(mid) {
            var e = feishuPendingReplies[mid];
            if (e) e.awaitingReply = true;
            startReplyWatcher();
          }, 2000, msg.id);
        }

        processed.push(msg.id);
        feishuLastProcessedId = msg.id;
        logPanel('info', '飞书消息已注入: ' + msg.content.substring(0,30));
      }
    }

    // 修复：仅标记真正处理过的消息，冷却期跳过的消息保留待下一轮处理
    for (var j = 0; j < processed.length; j++) {
      try { await apiJson('/api/feishu/messages', { id: processed[j] }, 'PUT'); } catch(e) {}
    }
  } catch(e) {
  } finally {
    feishuPollingInFlight = false;
  }
}

// ============================================================
// 导出到 window（供 panel.js 调用）
// ============================================================
window.__ds_initAgent = initAgent;
window.__ds_startupAgent = startupAgent;
window.__ds_exportLogs = exportLogsDownload;
window.__ds_onToolModeChange = setToolMode;
window.__ds_syncFullState = syncFullState;
window.__ds_testConnection = testConnection;
window.__ds_toggleSkill = toggleSkill;
window.__ds_saveQuickActions = saveQuickActions;
window.__ds_loadQuickActions = loadQuickActions;
window.__ds_openPermissions = openPermissions;
window.__ds_restrictPermissions = restrictPermissions;
window.__ds_startFeishuBridge = startFeishuBridge;
window.__ds_stopFeishuBridge = stopFeishuBridge;
window.__ds_injectToolPrompt = injectToolPrompt;
window.__ds_smartAgentAction = smartAgentAction;

// ── §3 续: 工具重试提示词 ────────────────────────────────
async function retryToolPrompt() {
  var monitor = window.__ds_monitor;
  var hasRecentFailure = false;
  var lastToolName = '';
  var failureCount = 0;

  if (monitor) {
    lastToolName = monitor._lastExecutedTool || '';
    failureCount = monitor._consecutiveFailures || 0;
    hasRecentFailure = failureCount > 0;
  }

  var recentErrors = [];
  if (executionHistory && executionHistory.length > 0) {
    for (var i = Math.max(0, executionHistory.length - 20); i < executionHistory.length; i++) {
      var log = executionHistory[i];
      if (log.level === 'error') {
        recentErrors.push('[' + (log.time || '') + '] ' + (log.message || ''));
      }
    }
  }

  var prompt;

  if (hasRecentFailure && lastToolName) {
    prompt = [
      '[系统指令 — 工具重试]',
      '',
      '你刚才使用工具 `' + lastToolName + '` 连续失败了 ' + failureCount + ' 次。',
      '',
      '请分析以下错误信息，调整参数后重试：'
    ].join('\n');

    if (recentErrors.length > 0) {
      prompt += '\n\n## 最近错误日志\n';
      for (var e = 0; e < Math.min(recentErrors.length, 5); e++) {
        prompt += '- ' + recentErrors[e] + '\n';
      }
    }

    prompt += '\n## 重试规则\n';
    prompt += '1. 检查工具参数是否正确（路径是否存在、格式是否正确）\n';
    prompt += '2. 尝试使用替代方案（如 read_file 失败 → 用 exec_command "type path" 代替）\n';
    prompt += '3. 如果是权限问题，尝试换一个目录操作\n';
    prompt += '4. 最多重试 2 次，如果仍然失败请分析原因并告知用户\n';
  } else if (recentErrors.length > 0) {
    prompt = [
      '[系统指令 — 工具重试]',
      '',
      '最近有一些工具调用错误，请分析以下错误日志并尝试修复：',
      '',
      '## 最近错误日志'
    ].join('\n');
    for (var e2 = 0; e2 < Math.min(recentErrors.length, 5); e2++) {
      prompt += '\n- ' + recentErrors[e2];
    }
    prompt += '\n\n请根据错误信息调整方法，尝试完成任务。';
  } else {
    prompt = [
      '[系统指令 — 工具重试]',
      '',
      '请回顾你最近的工具调用。如果有失败的调用，请：',
      '1. 分析失败原因',
      '2. 调整参数后重新调用',
      '3. 如果找不到合适的替代方案，告知用户',
      '',
      '如果最近没有工具调用，请告诉我你需要什么帮助。'
    ].join('\n');
  }

  var input = findChatInput();
  if (input) {
    setInputValue(input, prompt);
    await sleep(500);
    clickSendButton();
    logPanel('success', '工具重试提示已发送 (' + (hasRecentFailure ? lastToolName + ' ' + failureCount + '次失败' : '通用重试') + ')');
  } else {
    logPanel('error', '找不到输入框');
  }
}

// 供旧代码调用的全局
window.triggerQuickAction = triggerQuickAction;
window.loadPersonality = loadPersonality;
window.savePersonality = savePersonality;
window.resetPersonality = resetPersonality;
window.initMemory = initMemory;
window.loadMemory = loadMemory;
window.clearMemory = clearMemory;
window.saveMemory = saveMemory;
window.loadSkills = loadSkills;
window.toggleSkill = toggleSkill;
window.createSkill = createSkill;
window.deleteSkill = deleteSkill;
window.loadTools = loadTools;
window.setToolMode = setToolMode;
window.loadQuickActions = loadQuickActions;
window.saveQuickActions = saveQuickActions;
window.checkServerHealth = checkServerHealth;
window.testConnection = testConnection;
window.openPermissions = openPermissions;
window.restrictPermissions = restrictPermissions;
window.getConfig = getConfig;
window.syncFullState = syncFullState;
window.retryToolPrompt = retryToolPrompt;
window.smartAgentAction = smartAgentAction;
window.injectToolPrompt = injectToolPrompt;
window.startupAgent = startupAgent;

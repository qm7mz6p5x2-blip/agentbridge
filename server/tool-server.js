// ============================================================
// AgentBridge v0.1.1 — 本地工具服务器（装配层）
//
// 职责：HTTP 服务器 + 路由分发 + 启动装配。
// 业务逻辑已拆分为独立模块（见下方 requires），本文件只负责
//   - 创建全局实例（ToolRegistry / PluginRegistry）
//   - 启动前初始化（目录 / 内置技能 / 插件 / MCP）
//   - 路由 → 各业务模块委托
//
// 架构: 插件化工具系统
//   - 工具: AnyAgentTool { name, label, description, parameters, execute }
//   - 插件: { id, name, version, register(api) }
//   - 执行管道: beforeHook → execute → afterHook
//   - 模式: OFF(拒绝) / MANUAL(审批) / AUTO(直接)
//   - Web搜索: 委托给 DeepSeek 内置能力，不在服务端实现
//
// 模块清单：
//   config.js        常量/路径/CORS
//   logger.js        文件日志 appendLog
//   fs-utils.js      JSON 读写 / copyDir / removeDir / yaml
//   pi-memory.js     pi 记忆异步读取 + 缓存（原同步 I/O 已改造）
//   skills.js        技能系统核心
//   skill-tools.js   技能管理工具注册
//   agent-api.js     AGENT_API（personality/memory/tools/quick-actions）
//   plugin-tools.js  插件管理工具注册
//   feishu.js        飞书消息队列 + 回复
// ============================================================

const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const {
  PORT, ENGINE_VERSION,
  WORKSPACE_DIR, CONFIG_DIR, MEMORY_DIR, SKILLS_DIR, PLUGINS_DIR,
  BUILTIN_SKILLS_DIR, LOGS_DIR, PI_MEMORY_DIR, ALLOWED_WRITE_PATHS,
  CORS_WHITELIST, MAX_BODY_SIZE, BODY_TIMEOUT_MS, REQUEST_TIMEOUT_MS
} = require('./config');
const { ToolRegistry } = require('./tool-registry');
const { PluginRegistry } = require('./plugin-loader');
const mcpClient = require('./mcp-client');
const crossPlatform = require('./cross-platform');
const { appendLog } = require('./logger');
const { copyDir, withFileLock } = require('./fs-utils');
const piMemory = require('./pi-memory');
const skills = require('./skills');
const { registerSkillManagerTools } = require('./skill-tools');
const { createAgentApi } = require('./agent-api');
const { registerPluginManagerTools } = require('./plugin-tools');
const { handleFeishuMessages, handleFeishuReply } = require('./feishu');
const { createAuditLog } = require('./audit-log');
const { createPermissionPolicy } = require('./permission-policy');

// ============================================================
// 全局实例
// ============================================================
const toolRegistry = new ToolRegistry(WORKSPACE_DIR);
const auditLog = createAuditLog(WORKSPACE_DIR);
const permissionPolicy = createPermissionPolicy(path.join(CONFIG_DIR, 'permissions.json'));
const pluginRegistry = new PluginRegistry(toolRegistry, {
  workspaceDir: WORKSPACE_DIR,
  engineVersion: ENGINE_VERSION,
  scanDirs: [],
  extraFsRoots: [PI_MEMORY_DIR],
  memoryDir: PI_MEMORY_DIR
});

// ============================================================
// 目录初始化
// ============================================================
async function ensureDirectories() {
  const dirs = [WORKSPACE_DIR, CONFIG_DIR, MEMORY_DIR, SKILLS_DIR, PLUGINS_DIR, LOGS_DIR];
  for (const dir of dirs) {
    try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
  }
  // 非阻塞预热 WSL 探测，避免首个 exec_command 时因缓存未就绪回退 cmd.exe
  crossPlatform.WSL.warmup();
  // WSL VM 保活：常驻进程防止 VM 空闲自动关闭，消除每次 exec_command 的 5s 冷启动
  crossPlatform.WSL.startKeepAlive();
  await copyBuiltinSkills();
  console.log(`[ToolServer] 工作目录: ${WORKSPACE_DIR}`);
  console.log(`[ToolServer] 技能目录: ${SKILLS_DIR}`);
  console.log(`[ToolServer] 插件目录: ${PLUGINS_DIR}`);
}

async function copyBuiltinSkills() {
  try {
    const entries = await fs.readdir(BUILTIN_SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const src = path.join(BUILTIN_SKILLS_DIR, entry.name);
      const dst = path.join(SKILLS_DIR, entry.name);
      try { await fs.access(dst); } catch {
        await copyDir(src, dst);
        console.log(`[ToolServer] 安装内置技能: ${entry.name}`);
      }
    }
  } catch (e) {}
}

// ============================================================
// 插件加载
// ============================================================
async function loadPlugins() {
  console.log('[ToolServer] 发现并加载插件...');
  try {
    const discovered = await pluginRegistry.discover();
    for (const pluginDef of discovered) {
      const loaded = await pluginRegistry.load(pluginDef);
      const status = loaded ? ' meet' : ' muted';
      console.log(`[ToolServer] 插件 ${pluginDef.id || pluginDef.name || 'unknown'}: ${status}`);
    }

    // 输出诊断信息
    for (const diag of pluginRegistry.diagnosticMessages) {
      const prefix = diag.level === 'error' ? '[Plugin Error]' : '[Plugin Warn]';
      console.log(`[ToolServer] ${prefix} ${diag.pluginId}: ${diag.message}`);
    }

    console.log(`[ToolServer] 已加载 ${pluginRegistry.plugins.length} 个插件`);
    console.log(`[ToolServer] 已注册 ${toolRegistry.listTools().length} 个工具`);
  } catch (e) {
    console.error('[ToolServer] 插件加载失败:', e.message);
  }

  // 加载 MCP 服务器
  try {
    var mcpTools = await mcpClient.loadMcpServers(toolRegistry, WORKSPACE_DIR);
    if (mcpTools.length > 0) {
      console.log('[ToolServer] MCP 工具已注册: ' + mcpTools.join(', '));
    }
  } catch (e) {
    console.error('[ToolServer] MCP 加载失败:', e.message);
  }
}

// ============================================================
// Agent API（业务模块装配）
// ============================================================
const AGENT_API = createAgentApi({
  toolRegistry, pluginRegistry, skills, crossPlatform, piMemory, permissionPolicy
});

// ============================================================
// HTTP 服务器
// ============================================================
var GLOBAL_PERMISSIONS = false;
var server = http.createServer(async function(req, res) {
  // 【修复】请求超时保护：REQUEST_TIMEOUT_MS 后自动终止连接
  req.setTimeout(REQUEST_TIMEOUT_MS, function() {
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '请求超时' }));
    } else {
      res.end();
    }
  });

  var requestOrigin = req.headers.origin || '';
  // 【修复】无 Origin 头的请求（curl/Postman 等非浏览器客户端）应放行，CORS 仅约束浏览器跨域
  var isBrowserCorsRequest = requestOrigin !== '';
  var allowedOrigin = CORS_WHITELIST.indexOf(requestOrigin) >= 0 ? requestOrigin : '';
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // 【修复】Private Network Access (PNA)：Chrome 130+ 要求公网页面访问 localhost 时，
  // 预检与响应必须携带 Access-Control-Allow-Private-Network: true，否则请求被阻止
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    if (isBrowserCorsRequest && !allowedOrigin) { res.writeHead(403); res.end('Forbidden'); return; }
    res.writeHead(200); res.end(); return;
  }
  // 仅对浏览器跨域请求执行来源校验，非浏览器请求（无 Origin 头）放行
  if (isBrowserCorsRequest && !allowedOrigin && (req.method === 'POST' || req.method === 'GET')) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: '来源未授权' }));
    return;
  }

  try {
    var urlPath = req.url.split('?')[0];

    // --- Health ---
    if (urlPath === '/health' && req.method === 'GET') {
      var sysInfo = crossPlatform.getSystemInfo();
      var allTools = toolRegistry.listTools();
      var healthSkills = await skills.getSkillsWithStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok', version: ENGINE_VERSION,
        workspace: WORKSPACE_DIR, platform: sysInfo.platform, arch: sysInfo.arch,
        pid: process.pid, uptime: Math.floor(process.uptime()),
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
        tools_count: allTools.length,
        skills_count: healthSkills.skills.length,
        plugins_count: pluginRegistry.plugins.length,
        cpus: sysInfo.cpus
      }));
      return;
    }

    if (req.method === 'POST' || req.method === 'GET') {
      var body = req.method === 'POST' ? await parseBody(req) : parseQuery(req);
      var result;

      switch (urlPath) {

        // --- 工具执行 (通过 ToolRegistry 管道) ---
        case '/api/tool':
          if (!body.name) { result = { success: false, error: '缺少 name 参数' }; break; }
          result = await executeToolHttp(body.name, body.args || body, { toolCallId: body.toolCallId, mode: body.mode || 'auto' });
          break;

        // --- 工具列表 (新格式) ---
        case '/api/tools':
          if (req.method === 'GET') {
            result = { success: true, tools: toolRegistry.listTools() };
          } else if (body.action === 'execute') {
            result = await executeToolHttp(body.name, body.args || {}, { mode: body.mode || 'auto' });
          } else {
            result = { success: true, tools: toolRegistry.listTools() };
          }
          break;

        // --- 插件管理 ---
        case '/api/plugins':
          if (req.method === 'GET') {
            result = {
              success: true,
              plugins: pluginRegistry.plugins,
              diagnostics: pluginRegistry.diagnosticMessages
            };
          } else if (body.action === 'reload') {
            // 重新扫描并加载
            var discovered = await pluginRegistry.discover();
            var loadedCount = 0;
            for (var i = 0; i < discovered.length; i++) {
              if (await pluginRegistry.load(discovered[i])) loadedCount++;
            }
            result = {
              success: true,
              loaded: loadedCount,
              total: discovered.length,
              plugins: pluginRegistry.plugins,
              diagnostics: pluginRegistry.diagnosticMessages
            };
          } else {
            // 【修复】未知 action 返回错误而非 result=undefined
            result = { success: false, error: '未知操作: ' + (body.action || '(空)') };
          }
          break;

        // --- 飞书消息队列 ---
        case '/api/feishu/messages':
          result = await handleFeishuMessages(body, req.method);
          break;

        // --- 飞书回复回传 ---
        case '/api/feishu/reply':
          result = await handleFeishuReply(body);
          break;

        // --- 已废弃: 兼容旧 API 端点 (v0.1.1+ 请使用 /exec) ---
        case '/api/read':
          result = await executeToolLegacy('read_file', { path: body.path });
          break;
        case '/api/write':
          result = await executeToolLegacy('write_file', { path: body.path, content: body.content });
          break;
        case '/api/list':
          result = await executeToolLegacy('list_dir', { path: body.path });
          break;
        case '/api/exec':
          result = await executeToolLegacy('exec_command', { command: body.command, cwd: body.cwd, timeout: body.timeout });
          break;
        case '/api/append':
          result = await executeToolLegacy('append_file', { path: body.path, content: body.content });
          break;
        case '/api/search':
          result = await executeToolLegacy('search_files', { pattern: body.pattern, root: body.root });
          break;
        case '/api/file-info':
          result = await executeToolLegacy('get_file_info', { path: body.path });
          break;

        case '/api/log':
          await appendLog(body.level || 'INFO', body.message, body.data);
          result = { success: true };
          break;

        case '/api/confirm':
          // 二次确认执行 — 用户确认后重新执行被拦截的工具
          if (!body.tool || !body.args) {
            result = { success: false, error: '缺少 tool 或 args 参数' };
          } else {
            try {
              const confirmResult = await toolRegistry.executeToolConfirmed(body.tool, body.args, { toolCallId: 'confirm_' + Date.now() });
              result = unwrapToolResult(confirmResult);
            } catch (e) {
              result = { success: false, error: e.message };
            }
          }
          break;

        case '/api/config':
          result = await handleConfig(body);
          break;

        case '/api/audit':
          if (req.method === 'GET') {
            result = {
              success: true,
              entries: await auditLog.list({
                limit: body.limit,
                tool: body.tool,
                success: body.success === undefined ? undefined : body.success === 'true'
              }),
              stats: await auditLog.stats()
            };
          } else if (body.action === 'clear') {
            await auditLog.clear();
            result = { success: true, message: '审计日志已清空' };
          } else {
            result = { success: false, error: '未知操作: ' + (body.action || '(空)') };
          }
          break;

        case '/api/audit/stats':
          result = { success: true, stats: await auditLog.stats() };
          break;

        case '/api/permissions':
          if (req.method === 'GET') {
            result = {
              success: true,
              permissions: permissionPolicy.toJSON(),
              tools: toolRegistry.listTools().map(function (tool) {
                return {
                  name: tool.name,
                  mode: permissionPolicy.config.tools[tool.name] || permissionPolicy.config.defaultMode
                };
              })
            };
          } else {
            result = await handlePermissionUpdate(body);
          }
          break;

        case '/api/agent/personality':
          if (req.method === 'GET') result = await AGENT_API.personality_get();
          else if (body.action === 'save') result = await AGENT_API.personality_save(body.personality);
          else if (body.action === 'reset') result = await AGENT_API.personality_reset();
          else result = await AGENT_API.personality_get();
          break;

        case '/api/mcp/status':
          result = { success: true, mcp: mcpClient.getStatus() };
          break;

        case '/api/agent/memory':
          if (body.action === 'init') result = await AGENT_API.memory_init();
          else if (body.action === 'load') result = await AGENT_API.memory_load();
          else if (body.action === 'clear') result = await AGENT_API.memory_clear();
          else if (body.action === 'save') result = await AGENT_API.memory_save(body.key, body.data);
          else result = { success: false, error: '未知操作' };
          break;

        case '/api/agent/pi-summary':
          result = await AGENT_API.pi_summary(body.limit);
          break;

        case '/api/agent/skills':
          if (req.method === 'GET') result = await skills.skills_list();
          else if (body.action === 'toggle') result = await skills.skills_toggle(body.name, body.enabled);
          else if (body.action === 'create') result = await skills.skills_create(body.name, body.description, body.content);
          else if (body.action === 'delete') result = await skills.skills_delete(body.name);
          else result = await skills.skills_list();
          break;

        case '/api/agent/tools':
          if (req.method === 'GET') result = await AGENT_API.tools_list();
          else if (body.action === 'set_mode') result = await AGENT_API.tools_set_mode(body.name, body.mode);
          else if (body.action === 'create') result = await AGENT_API.tools_create(body.tool);
          else if (body.action === 'delete') result = await AGENT_API.tools_delete(body.name);
          else result = await AGENT_API.tools_list();
          break;

        case '/api/agent/status':
          result = await AGENT_API.status();
          break;

        case '/api/agent/quick-actions':
          if (req.method === 'GET') result = await AGENT_API.quick_actions_get();
          else if (body.action === 'save') result = await AGENT_API.quick_actions_save(body.actions);
          else result = await AGENT_API.quick_actions_get();
          break;

        case '/api/save_tool_history': {
          // 持久化工具调用历史，供 get_tool_history 工具查询（异步 I/O，不阻塞事件循环）
          try {
            var histPath = path.join(WORKSPACE_DIR, 'sessions', 'tool-history.json');
            // 【修复】加锁串行化读改写，避免并发保存丢失历史记录
            await withFileLock(histPath, async function() {
              await fs.mkdir(path.dirname(histPath), { recursive: true });
              var existing = { entries: [] };
              try { existing = JSON.parse(await fs.readFile(histPath, 'utf-8')); } catch(e) {}
              if (!existing.entries) existing.entries = [];
              existing.entries.push({
                iteration: body.iteration || (existing.entries.length + 1),
                results: body.results || [],
                timestamp: body.timestamp || Date.now()
              });
              // 保留最近 50 轮历史
              if (existing.entries.length > 50) existing.entries = existing.entries.slice(-50);
              await fs.writeFile(histPath, JSON.stringify(existing, null, 2), 'utf-8');
            });
            result = { success: true };
          } catch(e) {
            result = { success: false, error: e.message };
          }
          break;
        }

        case '/exec':
          if (req.method === 'POST') {
            var execToolName = body.tool;
            if (!execToolName) { result = { success: false, error: { code: 'MISSING_PARAM', message: '缺少 tool 参数' } }; break; }
            result = await executeToolHttp(execToolName, body.args || {}, { mode: body.mode || 'auto' });
          } else {
            result = { success: false, error: { code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST' } };
          }
          break;

        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Unknown endpoint: ' + urlPath }));
          return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
    }
  } catch (error) {
    console.error('[ToolServer] Error:', error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }));
  }
});

// ============================================================
// 辅助函数
// ============================================================

/**
 * 统一工具执行入口 — /api/tool、/api/tools(action=execute)、/exec 共用
 * 职责：日志 → 执行 → 解包 → success 推断 → 错误归一化
 */
async function executeToolHttp(toolName, args, opts) {
  opts = opts || {};
  args = args || {};
  const startedAt = Date.now();
  await appendLog('EXEC', '调用工具: ' + toolName, { args: args, mode: opts.mode || 'auto' });

  const permission = permissionPolicy.evaluate(toolName, opts.mode, {
    confirmed: opts.confirmed === true
  });
  if (!permission.allowed) {
    const blockedResult = {
      success: true,
      blocked: true,
      needsConfirmation: permission.needsConfirmation,
      reason: permission.reason,
      tool: toolName,
      mode: permission.mode
    };
    await auditLog.append({
      tool: toolName,
      args: args,
      mode: permission.mode,
      success: false,
      durationMs: Date.now() - startedAt,
      error: permission.reason
    });
    return blockedResult;
  }

  try {
    var toolResult = await toolRegistry.executeTool(toolName, args, {
      toolCallId: opts.toolCallId,
      mode: permission.mode,
      _fromHttp: true
    });
    var result = unwrapToolResult(toolResult);
    // 保留工具执行的实际成功/失败状态，未显式指定时根据 error/blocked 推断
    if (typeof result.success === 'undefined') {
      result.success = !result.error && !result.blocked;
    }
    await appendLog('EXEC', '工具完成: ' + toolName, { success: !!(result && result.success !== false) });
    await auditLog.append({
      tool: toolName,
      args: args,
      mode: permission.mode,
      success: result && result.success !== false && !result.blocked,
      durationMs: Date.now() - startedAt,
      error: result && result.error ? result.error : ''
    });
    return result;
  } catch (execErr) {
    var errResult = { success: false, error: execErr.message || String(execErr) };
    await appendLog('ERROR', '工具执行失败: ' + toolName + ' — ' + errResult.error);
    await auditLog.append({
      tool: toolName,
      args: args,
      mode: permission.mode,
      success: false,
      durationMs: Date.now() - startedAt,
      error: errResult.error
    });
    return errResult;
  }
}

/**
 * 解包插件格式 [{type:"text", text:"..."}] → {success, ...}
 */
function unwrapToolResult(toolResult) {
  if (Array.isArray(toolResult) && toolResult.length > 0 && toolResult[0].text) {
    try { return JSON.parse(toolResult[0].text); } catch (e) { return { content: toolResult[0].text }; }
  }
  return { content: toolResult };
}

async function executeToolLegacy(name, args) {
  var result = await toolRegistry.executeTool(name, args, { _fromHttp: true });
  return unwrapToolResult(result);
}

async function handleConfig(body) {
  if (body.action === 'get') {
    var sysInfo = crossPlatform.getSystemInfo();
    return {
      success: true, workspace: WORKSPACE_DIR, logsDir: LOGS_DIR,
      allowedWritePaths: ALLOWED_WRITE_PATHS, platform: sysInfo.platform,
      port: PORT, version: ENGINE_VERSION,
      tools_count: toolRegistry.listTools().length,
      plugins_count: pluginRegistry.plugins.length,
      globalPermissions: GLOBAL_PERMISSIONS
    };
  } else if (body.action === 'set-permissions') {
    GLOBAL_PERMISSIONS = !!body.global;
    // 安全限制: 即使全局权限开启，也只允许写入工作目录，不允许设置根路径
    ALLOWED_WRITE_PATHS.length = 0;
    ALLOWED_WRITE_PATHS.push(WORKSPACE_DIR);
    toolRegistry.setGlobalPermissions(GLOBAL_PERMISSIONS);
    return { success: true, globalPermissions: GLOBAL_PERMISSIONS };
  } else if (body.action === 'restrict-permissions') {
    GLOBAL_PERMISSIONS = false;
    ALLOWED_WRITE_PATHS.length = 0;
    ALLOWED_WRITE_PATHS.push(WORKSPACE_DIR);
    toolRegistry.setGlobalPermissions(false);
    return { success: true, globalPermissions: false };
  }
  return { success: false, error: '未知操作' };
}

async function handlePermissionUpdate(body) {
  try {
    if (body.tool) {
      const mode = await permissionPolicy.setToolMode(body.tool, body.mode);
      return { success: true, tool: body.tool, mode: mode };
    }
    if (body.defaultMode) {
      const mode = await permissionPolicy.setDefaultMode(body.defaultMode);
      return { success: true, defaultMode: mode };
    }
    if (typeof body.enforce === 'boolean') {
      const enforce = await permissionPolicy.setEnforce(body.enforce);
      return { success: true, enforce: enforce };
    }
    return { success: false, error: '缺少 tool、defaultMode 或 enforce 参数' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// 【修复】请求体最大 10MB，防止内存耗尽攻击
// 【修复】请求体接收超时 30 秒，防止慢速客户端挂起
function parseBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    var receivedBytes = 0;
    // 【修复】超时保护：若客户端在指定时间内未完成发送则中止
    var timer = setTimeout(function() {
      req.destroy(new Error('请求体接收超时'));
    }, BODY_TIMEOUT_MS);

    req.on('data', function(chunk) {
      receivedBytes += chunk.length;
      // 【修复】大小限制：超过上限立即中止连接
      if (receivedBytes > MAX_BODY_SIZE) {
        clearTimeout(timer);
        req.destroy(new Error('请求体超过最大限制 ' + MAX_BODY_SIZE + ' 字节'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function() {
      clearTimeout(timer);
      try {
        var buffer = Buffer.concat(chunks);
        var data = buffer.toString('utf-8');
        resolve(data ? JSON.parse(data) : {});
      } catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function parseQuery(req) {
  var urlObj = new URL(req.url, 'http://localhost');
  var params = {};
  urlObj.searchParams.forEach(function(v, k) { params[k] = v; });
  return params;
}

// ============================================================
// 启动
// ============================================================
ensureDirectories().then(async function() {
  await permissionPolicy.load();
  await loadPlugins();
  registerPluginManagerTools(toolRegistry, pluginRegistry, { pluginsDir: PLUGINS_DIR });
  registerSkillManagerTools(toolRegistry, skills);
  skills.startSkillsWatcher();

  // 【修复】监听错误处理：端口被占用时给出清晰提示并以特定退出码退出
  // 退出码 2 = 端口占用，launcher 可据此接管已有实例或等待端口释放
  server.on('error', function(err) {
    if (err && err.code === 'EADDRINUSE') {
      console.error('端口 ' + PORT + ' 已被占用 (EADDRINUSE)。');
      console.error('可能已有另一个工具服务器在运行。检查: netstat -ano | findstr :' + PORT);
      process.exit(2);
    }
    console.error('服务器错误: ' + (err && err.message || err));
    process.exit(1);
  });

  server.listen(PORT, function() {
    var sysInfo = crossPlatform.getSystemInfo();
    console.log('\n\x1b[36m\x1b[1m  AgentBridge v' + ENGINE_VERSION + ' — 本地工具服务器\x1b[0m\n');
    console.log('  Server:    http://localhost:' + PORT);
    console.log('  Workspace: ' + WORKSPACE_DIR);
    console.log('  Platform:  ' + sysInfo.platform + ' / ' + sysInfo.arch + ' / Node ' + sysInfo.nodeVersion);
    console.log('  Tools:     ' + toolRegistry.listTools().length + ' registered');
    console.log('  Plugins:   ' + pluginRegistry.plugins.length + ' loaded');
    console.log('  Skills:    SKILL.md');
    console.log('');
    console.log('  API v' + ENGINE_VERSION + ':  /exec (统一工具执行端点)');
    console.log('             /api/tool (ToolRegistry pipeline)');
    console.log('             /api/tools (list/execute)');
    console.log('             /api/plugins (list/reload)');
    console.log('             /api/audit (execution history)');
    console.log('             /api/permissions (tool permission policy)');
    console.log('             /api/read|write|list|exec|append|search|file-info (legacy compat)');
    console.log('             /api/agent/* (personality/memory/skills/tools/quick-actions)');
  });
});

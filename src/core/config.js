// 端口优先级：环境变量 DTA_PORT > 3004
// 改用 3004 避免与 openclaw-gateway（3002）冲突
var DEFAULT_PORT = (typeof process !== 'undefined' && process.env && process.env.DTA_PORT) ? parseInt(process.env.DTA_PORT, 10) : 3004;
var DS_CONFIG = {
  serverUrl: 'http://localhost:' + DEFAULT_PORT,
  globalPermissions: false,
  endpoints: {
    health: '/health',
    tool: '/api/tool',
    exec: '/exec',
    config: '/api/config',
    save_tool_history: '/api/save_tool_history'
  },
  monitor: {
    pollInterval: 200,
    stableThreshold: 5,
    stableThresholdExtra: 15,
    autoResumeTimeout: 5000,
    maxToolIterations: 20
  },
  circuitBreaker: {
    maxConsecutiveFails: 3,
    cooldownMs: 60000
  }
};

function getServerUrl() {
  return DS_CONFIG.serverUrl;
}

function getEndpoint(name) {
  return DS_CONFIG.serverUrl + (DS_CONFIG.endpoints[name] || '');
}

// 配置校验：serverUrl 仅允许回环地址，防止存储被篡改后把工具调用发送到外部服务器
function _sanitizeServerUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    var u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    var host = u.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return url;
  } catch (e) {}
  return null;
}

// 配置校验：数值必须为有限数且在合理范围内
function _sanitizeNum(value, def, min, max) {
  var n = Number(value);
  if (value === null || value === undefined || value === '') return def;
  if (!isFinite(n)) return def;
  if (min !== undefined && n < min) return def;
  if (max !== undefined && n > max) return def;
  return n;
}

function loadConfigFromStorage(callback) {
  chrome.storage.local.get(['dsConfig'], function(result) {
    if (result.dsConfig) {
      var cfg = result.dsConfig;
      // 修复：用 !== undefined 判断而非真值，避免合法 falsy 值（如 0）被忽略
      // 修复：校验 serverUrl 仅限回环地址、数值限制在合理范围，防止恶意存储数据篡改
      var safeUrl = _sanitizeServerUrl(cfg.serverUrl);
      if (safeUrl) DS_CONFIG.serverUrl = safeUrl;
      if (cfg.globalPermissions !== undefined) DS_CONFIG.globalPermissions = !!cfg.globalPermissions;
      if (cfg.monitor) {
        if (cfg.monitor.pollInterval !== undefined) DS_CONFIG.monitor.pollInterval = _sanitizeNum(cfg.monitor.pollInterval, DS_CONFIG.monitor.pollInterval, 50, 60000);
        if (cfg.monitor.stableThreshold !== undefined) DS_CONFIG.monitor.stableThreshold = _sanitizeNum(cfg.monitor.stableThreshold, DS_CONFIG.monitor.stableThreshold, 1, 100);
        if (cfg.monitor.maxToolIterations !== undefined) DS_CONFIG.monitor.maxToolIterations = _sanitizeNum(cfg.monitor.maxToolIterations, DS_CONFIG.monitor.maxToolIterations, 1, 100);
        if (cfg.monitor.autoResumeTimeout !== undefined) DS_CONFIG.monitor.autoResumeTimeout = _sanitizeNum(cfg.monitor.autoResumeTimeout, DS_CONFIG.monitor.autoResumeTimeout, 0, 60000);
      }
      if (cfg.circuitBreaker) {
        if (cfg.circuitBreaker.maxConsecutiveFails !== undefined) DS_CONFIG.circuitBreaker.maxConsecutiveFails = _sanitizeNum(cfg.circuitBreaker.maxConsecutiveFails, DS_CONFIG.circuitBreaker.maxConsecutiveFails, 1, 20);
      }
    }
    if (callback) callback();
  });
}

function saveConfigToStorage(configOverride, callback) {
  // 修复：保存前同样校验 serverUrl，只允许回环地址
  var serverUrl = _sanitizeServerUrl(configOverride.serverUrl) || DS_CONFIG.serverUrl;
  var toSave = {
    serverUrl: serverUrl,
    globalPermissions: configOverride.globalPermissions !== undefined ? !!configOverride.globalPermissions : DS_CONFIG.globalPermissions,
    monitor: {
      pollInterval: configOverride.pollInterval !== undefined ? _sanitizeNum(configOverride.pollInterval, DS_CONFIG.monitor.pollInterval, 50, 60000) : DS_CONFIG.monitor.pollInterval,
      stableThreshold: configOverride.stableThreshold !== undefined ? _sanitizeNum(configOverride.stableThreshold, DS_CONFIG.monitor.stableThreshold, 1, 100) : DS_CONFIG.monitor.stableThreshold,
      maxToolIterations: configOverride.maxToolIterations !== undefined ? _sanitizeNum(configOverride.maxToolIterations, DS_CONFIG.monitor.maxToolIterations, 1, 100) : DS_CONFIG.monitor.maxToolIterations,
      autoResumeTimeout: configOverride.autoResumeTimeout !== undefined ? _sanitizeNum(configOverride.autoResumeTimeout, DS_CONFIG.monitor.autoResumeTimeout, 0, 60000) : DS_CONFIG.monitor.autoResumeTimeout
    },
    circuitBreaker: {
      maxConsecutiveFails: configOverride.maxConsecutiveFails !== undefined ? _sanitizeNum(configOverride.maxConsecutiveFails, DS_CONFIG.circuitBreaker.maxConsecutiveFails, 1, 20) : DS_CONFIG.circuitBreaker.maxConsecutiveFails
    }
  };

  chrome.storage.local.set({ dsConfig: toSave }, function() {
    DS_CONFIG.serverUrl = toSave.serverUrl;
    DS_CONFIG.globalPermissions = toSave.globalPermissions;
    DS_CONFIG.monitor.pollInterval = toSave.monitor.pollInterval;
    DS_CONFIG.monitor.stableThreshold = toSave.monitor.stableThreshold;
    DS_CONFIG.monitor.maxToolIterations = toSave.monitor.maxToolIterations;
    DS_CONFIG.monitor.autoResumeTimeout = toSave.monitor.autoResumeTimeout;
    DS_CONFIG.circuitBreaker.maxConsecutiveFails = toSave.circuitBreaker.maxConsecutiveFails;
    if (callback) callback();
  });
}

// ═══════════════════════════════════════════════════════════
// Store 集成 — 当 DS_CONFIG 变化时同步到 Store
// ═══════════════════════════════════════════════════════════
var _originalSaveConfigToStorage = saveConfigToStorage;
saveConfigToStorage = function(configOverride, callback) {
  _originalSaveConfigToStorage(configOverride, function() {
    // 同步到 Store
    if (typeof updateAppState === 'function') {
      updateAppState(function(prev) {
        return Object.assign({}, prev, {
          server: Object.assign({}, prev.server, { url: DS_CONFIG.serverUrl }),
          permissions: Object.assign({}, prev.permissions, { globalPermissions: DS_CONFIG.globalPermissions })
        });
      });
    }
    if (callback) callback();
  });
};

// ═══════════════════════════════════════════════════════════
// 通用 API 请求 — 优先走 SW 代理，回退直连
//
// 背景: Chrome 130+ 的 Private Network Access (PNA) 会拦截公网页面
// (chat.deepseek.com) → localhost 的 fetch，即使服务器返回了
// Access-Control-Allow-Private-Network 仍可能被新版 Chrome 拒绝
// ("Permission was denied ... loopback")。
// 解决: background SW 拥有 http://localhost:3004/* 的 host_permissions，
// 由其代为请求即可完全绕开 PNA/CORS。
// ═══════════════════════════════════════════════════════════

// 经 background SW 代理请求本地服务器（返回 Response 风格对象）
function proxyFetch(endpoint, options) {
  options = options || {};
  var method = (options.method || 'GET').toUpperCase();
  var body = null;
  if (options.body !== undefined && options.body !== null) {
    try { body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body; } catch(e) { body = options.body; }
  }
  return new Promise(function(resolve, reject) {
    var settled = false;
    function done(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    }
    // 超时保护：SW 休眠/异常时 sendMessage 回调可能永不触发，避免 Promise 永久挂起
    // 挂起会导致注入流程卡死在「获取实时工具列表」，超时后走 directFetch 兜底
    var timer = setTimeout(function() {
      done(reject, new Error('proxyFetch 超时 (15s): ' + endpoint));
    }, 15000);
    try {
      chrome.runtime.sendMessage({ action: 'proxyFetch', method: method, path: endpoint, body: body }, function(response) {
        if (chrome.runtime.lastError) { done(reject, new Error(chrome.runtime.lastError.message)); return; }
        if (response && response.ok) {
          done(resolve, {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            json: function() { return Promise.resolve(response.data); },
            text: function() { return Promise.resolve(JSON.stringify(response.data)); }
          });
        } else {
          done(reject, new Error((response && response.error) || '代理请求失败'));
        }
      });
    } catch(e) { done(reject, e); }
  });
}

// 带超时的直连 fetch（回退路径，用于本地/模拟页面等无 PNA 限制场景）
function directFetch(endpoint, options) {
  options = options || {};
  var finalOpts = { method: options.method || 'GET', headers: options.headers || { 'Content-Type': 'application/json' } };
  if (options.body) finalOpts.body = options.body;
  try { finalOpts.signal = AbortSignal.timeout(5000); } catch(e) {}
  return fetch(DS_CONFIG.serverUrl + endpoint, finalOpts);
}

// 统一入口: 优先 SW 代理，失败回退直连
function apiRequest(endpoint, options) {
  return proxyFetch(endpoint, options).catch(function(e) {
    return directFetch(endpoint, options);
  });
}

window.__ds_proxyFetch = proxyFetch;
window.__ds_directFetch = directFetch;
window.__ds_apiRequest = apiRequest;

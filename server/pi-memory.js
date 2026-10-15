// ============================================================
// pi 记忆读取模块 — 异步化 + 缓存
//
// 原 tool-server.js 中的 pi_summary 使用同步 readFileSync 递归扫描
// WSL UNC 路径（//wsl$/Ubuntu/...），会阻塞 Node 事件循环数秒。
// 本模块改为：
//   1. 异步 fs.promises 读取（不阻塞事件循环）
//   2. 结果缓存（TTL 30s），避免高频 /api/agent/pi-summary 反复读盘
//   3. 目录不存在 / 读取失败时优雅降级
// ============================================================
const fsp = require('fs').promises;
const path = require('path');
const { PI_MEMORY_DIR } = require('./config');

const PI_CORE_FILES = [
  'MEMORY.md', 'USER.md', 'PROJECTS.md', 'PORTFOLIO.md',
  'HANDOFF.md', 'SCRATCHPAD.md', 'SOUL.md', 'TIMELINE.md',
  'self-distillation.md'
];

// 缓存：{ timestamp, files }
let _cache = null;
let _inflight = null; // 防止并发重复扫描
const CACHE_TTL_MS = 30000;

/**
 * 读取 pi 记忆核心文件的摘要（异步 + 缓存）
 * @param {number} limitPerFile - 每个文件最多返回的字符数
 * @returns {Promise<{success, storageDir, accessible, fileCount, files}>}
 */
async function piSummary(limitPerFile) {
  limitPerFile = limitPerFile || 3000;

  // 命中缓存（未过期）直接返回
  if (_cache && (Date.now() - _cache.timestamp < CACHE_TTL_MS)) {
    return { success: true, storageDir: PI_MEMORY_DIR, accessible: _cache.accessible, fileCount: _cache.files.length, files: _cache.files, cached: true };
  }

  // 已有扫描在进行中，复用该 Promise（防并发重复读盘）
  if (_inflight) {
    const result = await _inflight;
    return filterByLimit(result, limitPerFile);
  }

  _inflight = (async function() {
    var files = [];
    var dirExists = false;

    try { dirExists = (await fsp.stat(PI_MEMORY_DIR)).isDirectory(); } catch (e) { dirExists = false; }

    if (dirExists) {
      for (var i = 0; i < PI_CORE_FILES.length; i++) {
        var name = PI_CORE_FILES[i];
        var fp = path.join(PI_MEMORY_DIR, name);
        try {
          // 用 readFile（异步），避免 readFileSync 阻塞事件循环
          var content = await fsp.readFile(fp, 'utf-8');
          files.push({ name: name, content: content, length: content.length });
        } catch (e) { /* 文件不存在或读取失败，跳过 */ }
      }
    }

    // 缓存完整内容
    _cache = { timestamp: Date.now(), accessible: dirExists, files: files };
    return { accessible: dirExists, files: files };
  })();

  try {
    const result = await _inflight;
    return { success: true, storageDir: PI_MEMORY_DIR, accessible: result.accessible, fileCount: result.files.length, files: result.files };
  } finally {
    _inflight = null;
  }
}

// 按 limitPerFile 截断返回（缓存存完整内容，返回时再截断，保证不同 limit 参数正确）
function filterByLimit(result, limitPerFile) {
  var files = result.files.map(function(f) {
    var safe = f.content.slice(0, limitPerFile);
    if (f.content.length > limitPerFile) safe += '\n...(截断)';
    return { name: f.name, content: safe, length: f.content.length };
  });
  return { success: true, storageDir: PI_MEMORY_DIR, accessible: result.accessible, fileCount: files.length, files: files, cached: true };
}

/**
 * 清空缓存（测试 / 配置变更时调用）
 */
function clearCache() {
  _cache = null;
  _inflight = null;
}

module.exports = { piSummary, clearCache, PI_CORE_FILES };

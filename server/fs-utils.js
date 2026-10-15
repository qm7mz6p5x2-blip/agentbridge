// ============================================================
// 文件工具模块 — JSON 读写 / 目录复制删除 / YAML frontmatter
// ============================================================
const fs = require('fs').promises;
const path = require('path');

// 每文件写锁队列：串行化对同一路径的读改写，防止并发请求丢失数据
var _fileLocks = new Map();

/**
 * 以互斥方式执行对指定文件的读写操作。
 * 同一路径上的并发调用会排队串行执行，前一个完成后下一个才开始。
 * @param {string} filePath - 目标文件路径（用于区分锁）
 * @param {Function} fn - 需要互斥执行的异步函数
 * @returns {Promise} fn 的返回结果
 */
function withFileLock(filePath, fn) {
  var key = path.resolve(filePath);
  var prev = _fileLocks.get(key) || Promise.resolve();
  var run = prev.then(function() { return fn(); });
  // 吞掉错误避免队列中断，run 的真实结果仍返回给调用方
  var tail = run.then(function() {}, function() {});
  _fileLocks.set(key, tail);
  tail.then(function() {
    if (_fileLocks.get(key) === tail) _fileLocks.delete(key);
  });
  return run;
}

/**
 * 读取 JSON 文件，失败时返回默认值或抛出
 */
async function readJsonFile(filePath, defaultValue) {
  try { var raw = await fs.readFile(filePath, 'utf-8'); return JSON.parse(raw); }
  catch (e) { if (defaultValue !== undefined) return defaultValue; throw e; }
}

/**
 * 写入 JSON 文件（自动建目录）
 */
async function writeJsonFile(filePath, data) {
  var dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 递归复制目录
 */
async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  var entries = await fs.readdir(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var fullSrc = path.join(src, entries[i].name);
    var fullDst = path.join(dst, entries[i].name);
    if (entries[i].isDirectory()) await copyDir(fullSrc, fullDst);
    else await fs.copyFile(fullSrc, fullDst);
  }
}

/**
 * 递归删除目录
 */
async function removeDir(dirPath) {
  var entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dirPath, entries[i].name);
    if (entries[i].isDirectory()) await removeDir(full);
    else await fs.unlink(full);
  }
  await fs.rmdir(dirPath);
}

/**
 * 解析 YAML Frontmatter（SKILL.md）
 * 返回 { frontmatter: {}, body: string }
 */
function parseYamlFrontmatter(content) {
  var match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { frontmatter: {}, body: content };
  var yaml = match[1];
  var body = content.substring(match[0].length);
  var fm = {};
  var lines = yaml.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var kv = lines[i].match(/^(\w[\w_-]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { frontmatter: fm, body };
}

module.exports = { readJsonFile, writeJsonFile, copyDir, removeDir, parseYamlFrontmatter, withFileLock };

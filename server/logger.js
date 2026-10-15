// ============================================================
// 日志模块 — 文件日志（appendLog）
// ============================================================
const fs = require('fs').promises;
const path = require('path');
const { LOGS_DIR } = require('./config');

/**
 * 追加一行日志到 logs/tool-server-YYYY-MM-DD.log
 * @param {string} level - INFO / EXEC / ERROR 等
 * @param {string} message - 日志消息
 * @param {object} [data] - 附加结构化数据（截断到 500 字符）
 */
async function appendLog(level, message, data) {
  try {
    var now = new Date();
    var dateStr = now.toISOString().split('T')[0];
    var timeStr = now.toTimeString().split(' ')[0];
    var logFile = path.join(LOGS_DIR, 'tool-server-' + dateStr + '.log');
    var logLine = '[' + timeStr + '] [' + level + '] ' + message;
    if (data) logLine += ' | data=' + JSON.stringify(data).substring(0, 500);
    logLine += '\n';
    await fs.appendFile(logFile, logLine, 'utf-8');
  } catch (e) {}
}

module.exports = { appendLog };

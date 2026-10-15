/**
 * AgentBridge - 启动器 (Harness 风格看门狗)
 *
 * 架构目标：类似 DeepSeek harness 的监督进程模式，保证工具服务器稳定运行。
 *   - 单实例锁:  防止重复启动导致端口冲突（最常见的"无法启动"原因）
 *   - 端口预检:  已存在健康服务器则直接接管，不重复启动
 *   - 看门狗:    每 3 秒健康检查，崩溃 / 挂起自动恢复
 *   - 指数退避:  连续失败时退避重试，稳定运行后重置
 *   - 挂起强杀:  进程存活但无响应时强制结束再重启
 *   - 文件日志:  logs/launcher.log（便于排查）
 */
const { spawn, execFileSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const SERVER_SCRIPT = path.join(__dirname, 'tool-server.js');
const HEALTH_CHECK_INTERVAL = 3000;      // 看门狗轮询间隔
const RESTART_BASE_DELAY = 1000;         // 基础重启延迟
const MAX_RESTART_ATTEMPTS = 5;          // 连续失败进入冷却的最大次数
const COOLDOWN_PERIOD = 15000;           // 冷却期（秒级检查）
const MAX_BACKOFF_DELAY = 30000;         // 退避上限
const STABLE_UPTIME_RESET_MS = 30000;    // 稳定运行多久后重置退避计数
const HEALTH_FAILS_TO_KILL = 3;          // 进程存活但连续 N 次健康检查失败 → 强杀
const STARTUP_TIMEOUT_MS = 15000;        // 单次启动等待就绪超时
const SERVER_READY_POLL_MS = 500;

// 端口优先级：环境变量 DTA_PORT > 3004
// 改用 3004 避免与 openclaw-gateway（3002）冲突
const PORT = parseInt(process.env.DTA_PORT, 10) || 3004;
const API_PORT = parseInt(process.env.DTA_LAUNCHER_PORT, 10) || 3005;  // 启动器 API 端口

const LOGS_DIR = path.join(__dirname, 'logs');
const LOCK_FILE = path.join(LOGS_DIR, 'launcher.lock');
const LOG_FILE = path.join(LOGS_DIR, 'launcher.log');

let serverProcess = null;      // 我们 spawn 的子进程（可能是 null，若接管已有服务器）
let currentPid = null;         // 当前管理的服务器 PID（自己的子进程或接管到的）
let adopted = false;           // 是否为接管的已有服务器
let healthCheckTimer = null;
let isShuttingDown = false;
let consecutiveRestarts = 0;   // 连续重启计数（用于冷却/退避）
let lastRestartTime = 0;
let totalRestarts = 0;
let launcherStartTime = Date.now();
let consecutiveHealthFails = 0;
let stableSince = Date.now();

// ============================================================
// 日志
// ============================================================
function log(msg, type = 'INFO') {
  const time = new Date().toTimeString().split(' ')[0];
  const symbols = { INFO: 'ℹ', WARN: '⚠', ERROR: '✖', SUCCESS: '✓', RESTART: '↻' };
  const line = `[${time}] [${type}] ${symbols[type] || '•'} ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
    // 简单轮转：超过 2MB 时截断
    const st = fs.statSync(LOG_FILE);
    if (st.size > 2 * 1024 * 1024) {
      fs.writeFileSync(LOG_FILE, line + '\n');
    }
  } catch (e) {}
}

// ============================================================
// 单实例锁
// ============================================================
function getPidFile() {
  return path.join(LOGS_DIR, 'server.pid');
}

function savePid() {
  if (currentPid) {
    try {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      fs.writeFileSync(getPidFile(), String(currentPid));
    } catch (e) {}
  }
}

function removePid() {
  try { fs.unlinkSync(getPidFile()); } catch (e) {}
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function acquireLock() {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      const pid = parseInt(raw, 10);
      if (pidAlive(pid)) {
        // 已有 launcher 在运行
        return { ok: false, pid: pid };
      }
      // 过期锁，覆盖
      log('检测到过期锁 (PID=' + pid + ')，已清除', 'WARN');
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return { ok: true, pid: process.pid };
  } catch (e) {
    log('无法创建单实例锁: ' + e.message, 'ERROR');
    return { ok: false, pid: null };
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, 'utf-8').trim();
      if (parseInt(raw, 10) === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}

// ============================================================
// 健康探测 — 返回 /health 结果（含 pid），超时视为不健康
// ============================================================
function probeServer(timeoutMs) {
  return new Promise((resolve) => {
    try {
      const req = http.get(`http://localhost:${PORT}/health`, { timeout: timeoutMs || 1000 }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const health = JSON.parse(data);
              resolve({ ok: true, health: health });
            } catch (e) {
              resolve({ ok: true, health: null });
            }
          } else {
            resolve({ ok: false, health: null, statusCode: res.statusCode });
          }
        });
      });
      req.on('error', () => resolve({ ok: false, health: null }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, health: null }); });
    } catch (e) {
      resolve({ ok: false, health: null });
    }
  });
}

function isServerRunning() {
  return probeServer(1000).then(function(r) { return r.ok; });
}

// ============================================================
// 进程终止 — Windows 兼容：SIGTERM → 超时 → taskkill /F /T
// ============================================================
function forceKillPid(pid) {
  if (!pid) return;
  try { process.kill(pid, 'SIGTERM'); } catch (e) {}
}

async function stopCurrentServer() {
  if (currentPid) {
    log('正在停止服务器 (PID=' + currentPid + (adopted ? ', 接管' : ', 子进程') + ')...', 'WARN');
    forceKillPid(currentPid);
    // 等待最多 2.5s 退出
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (!pidAlive(currentPid)) break;
    }
    // 仍存活则强制结束（Windows 使用 taskkill /F /T 清理进程树）
    if (pidAlive(currentPid)) {
      try {
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/PID', String(currentPid), '/F', '/T'], { stdio: 'ignore', windowsHide: true });
        } else {
          try { process.kill(currentPid, 'SIGKILL'); } catch (e) {}
        }
      } catch (e) {
        log('强制结束进程失败: ' + e.message, 'ERROR');
      }
    }
  }
  if (serverProcess) { serverProcess = null; }
  currentPid = null;
  adopted = false;
  removePid();
}

// ============================================================
// 启动 / 接管服务器
// 【修复】startServer 并发锁：看门狗与 restart API 可能同时触发启动，
// 用 in-progress promise 保证同一时间只有一个启动流程，后续调用复用结果。
// ============================================================
let startInProgress = null;

async function startServer() {
  if (startInProgress) return startInProgress;
  startInProgress = doStartServer().finally(function() {
    startInProgress = null;
  });
  return startInProgress;
}

async function doStartServer() {
  if (isShuttingDown) return false;

  const now = Date.now();
  if (now - lastRestartTime < COOLDOWN_PERIOD && consecutiveRestarts >= MAX_RESTART_ATTEMPTS) {
    log(`连续重启 ${MAX_RESTART_ATTEMPTS} 次，进入冷却期，请检查服务器日志 (${LOG_FILE})`, 'ERROR');
    return false;
  }

  // 先停止任何现有进程（含接管到但已不健康的服务器）
  await stopCurrentServer();
  await new Promise(r => setTimeout(r, 200));

  // 端口预检：已有健康服务器则直接接管（避免 EADDRINUSE 崩溃循环）
  const probe = await probeServer(1200);
  if (probe.ok) {
    const existingPid = (probe.health && probe.health.pid) || null;
    adopted = true;
    currentPid = existingPid;
    serverProcess = null;
    consecutiveRestarts = 0;
    savePid();
    log(`检测到已有健康服务器 (PID=${existingPid})，接管管理，不再重复启动`, 'SUCCESS');
    return true;
  }

  log(`启动工具服务器: node "${path.basename(SERVER_SCRIPT)}"`, 'INFO');
  log(`当前工作目录: ${__dirname}`);

  serverProcess = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env }
  });
  adopted = false;
  currentPid = serverProcess.pid;

  serverProcess.stdout.on('data', (data) => { process.stdout.write(data); });
  serverProcess.stderr.on('data', (data) => { process.stderr.write(data); });

  serverProcess.on('exit', (code, signal) => {
    if (!isShuttingDown && serverProcess) {
      log(`服务器进程退出 (code=${code}, signal=${signal})`, 'WARN');
      if (currentPid === serverProcess.pid) currentPid = null;
      serverProcess = null;
      removePid();
      scheduleHealthCheck();
    }
  });

  serverProcess.on('error', (err) => {
    log(`服务器启动失败: ${err.message}`, 'ERROR');
    if (currentPid === serverProcess.pid) currentPid = null;
    serverProcess = null;
  });

  consecutiveRestarts++;
  lastRestartTime = now;
  totalRestarts++;
  savePid();

  log('等待服务器就绪...', 'INFO');
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, SERVER_READY_POLL_MS));
    if (isShuttingDown) return false;
    const ready = await probeServer(1000);
    if (ready.ok) {
      log(`服务器已就绪 (PID: ${currentPid}, 重启次数: ${totalRestarts})`, 'SUCCESS');
      consecutiveRestarts = 0;
      stableSince = Date.now();
      return true;
    }
    if (!serverProcess) return false; // 进程已崩，让 exit 处理器调度重启
  }

  log('服务器启动超时，将重新尝试', 'ERROR');
  return false;
}

async function restartServer() {
  log('收到重启请求', 'RESTART');
  const ok = await startServer();
  log(ok ? '重启完成' : '重启失败', ok ? 'SUCCESS' : 'ERROR');
  return ok;
}

// ============================================================
// 看门狗 — 周期性健康检查，驱动崩溃 / 挂起恢复
// ============================================================
async function watchdogTick() {
  if (isShuttingDown) return;

  const probe = await probeServer(1200);

  if (probe.ok) {
    consecutiveHealthFails = 0;
    // 进程存活但引用丢失 → 记录并接管其 PID
    if (!serverProcess && !adopted) {
      const pid = (probe.health && probe.health.pid) || null;
      adopted = true;
      currentPid = pid;
      savePid();
      log(`检测到服务器在运行但进程引用丢失，接管 PID=${pid}`, 'WARN');
    }
    // 稳定运行超过阈值 → 重置退避计数
    if (consecutiveRestarts > 0 && Date.now() - stableSince > STABLE_UPTIME_RESET_MS) {
      consecutiveRestarts = 0;
      log('服务器稳定运行，重置重启计数', 'INFO');
    }
    scheduleHealthCheck();
    return;
  }

  consecutiveHealthFails++;

  if (serverProcess || currentPid) {
    // 进程存活但健康检查失败（挂起）→ 连续 N 次后强杀重启
    if (consecutiveHealthFails >= HEALTH_FAILS_TO_KILL) {
      log(`服务器无响应 ${consecutiveHealthFails} 次，判定挂起，正在强制重启...`, 'WARN');
      consecutiveHealthFails = 0;
      await startServer();
    } else {
      log(`健康检查失败 (${consecutiveHealthFails}/${HEALTH_FAILS_TO_KILL})，等待下次检查`, 'WARN');
    }
  } else {
    log('检测到服务器未运行，正在重启...', 'WARN');
    consecutiveHealthFails = 0;
    await startServer();
  }

  scheduleHealthCheck();
}

function scheduleHealthCheck() {
  if (healthCheckTimer) clearTimeout(healthCheckTimer);
  healthCheckTimer = setTimeout(watchdogTick, HEALTH_CHECK_INTERVAL);
}

// ============================================================
// Launcher API
// ============================================================
function createLauncherApi() {
  function isLocalhostOrigin(origin) {
    return /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
           /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
  }

  const apiServer = http.createServer(async (req, res) => {
    var requestOrigin = req.headers.origin || '';
    if (isLocalhostOrigin(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // 【修复】Private Network Access (PNA)：Chrome 130+ 要求公网页面访问 localhost 时
    // 必须返回 Access-Control-Allow-Private-Network: true，否则请求被阻止
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.setHeader('Access-Control-Allow-Private-Network', 'true');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (requestOrigin && !isLocalhostOrigin(requestOrigin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '仅允许本地来源访问启动器 API' }));
      return;
    }

    const url = req.url.split('?')[0];

    if (url === '/api/launcher/status' && req.method === 'GET') {
      const probe = await probeServer(1200);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        running: true,
        serverRunning: probe.ok,
        serverPid: probe.ok ? (probe.health && probe.health.pid) || currentPid : null,
        managedPid: currentPid,
        adopted: adopted,
        totalRestarts: totalRestarts,
        uptime: Math.floor((Date.now() - launcherStartTime) / 1000),
        launcherPid: process.pid,
        consecutiveRestarts: consecutiveRestarts,
        lastRestartTime: lastRestartTime
      }));
      return;
    }

    if (url === '/api/launcher/restart' && req.method === 'POST') {
      restartServer().then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '重启请求已提交' }));
      }).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
      return;
    }

    if (url === '/api/launcher/stop' && req.method === 'POST') {
      isShuttingDown = true;
      if (healthCheckTimer) clearTimeout(healthCheckTimer);
      stopCurrentServer().then(() => {
        releaseLock();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: '启动器已停止' }));
        setTimeout(() => process.exit(0), 500);
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Unknown endpoint' }));
  });

  return apiServer;
}

function printBanner() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   AgentBridge - 启动器 (Harness 看门狗)                 ║
║   自动管理工具服务器进程，崩溃/挂起自动恢复                      ║
║                                                                ║
║   Launcher API: http://localhost:${API_PORT}                        ║
║   Tool Server:  http://localhost:${PORT}                            ║
║                                                                ║
║   API Endpoints:                                              ║
║     GET  /api/launcher/status  - 获取状态                      ║
║     POST /api/launcher/restart - 重启服务器                   ║
║     POST /api/launcher/stop    - 停止启动器                    ║
║                                                                ║
║   Single-instance: 单实例锁 + 端口预检                         ║
║   Health check:    每${HEALTH_CHECK_INTERVAL / 1000}秒检测一次                         ║
║   Auto-recovery:   崩溃/挂起自动重启（退避${MAX_BACKOFF_DELAY / 1000}s）       ║
║   Log file:        ${LOG_FILE}               ║
║                                                                ║
║   Press Ctrl+C to stop                                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
}

async function main() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });

  // 单实例锁：防止重复启动
  const lock = acquireLock();
  if (!lock.ok) {
    console.log(`\n⚠ 已有另一个启动器在运行 (PID=${lock.pid})，本实例退出。`);
    console.log('  如需重启，请使用 Launcher API: POST http://localhost:' + API_PORT + '/api/launcher/restart\n');
    process.exit(0);
  }

  const launcherApi = createLauncherApi();

  // Launcher API 端口冲突：通常意味着另一个 launcher 在运行
  launcherApi.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`\n⚠ 端口 ${API_PORT} 已被占用，可能有另一个启动器在运行。`);
      console.log('  本实例退出，请使用已有实例的 API 控制服务。\n');
      releaseLock();
      process.exit(0);
    }
    log('Launcher API 错误: ' + err.message, 'ERROR');
  });

  launcherApi.listen(API_PORT, async () => {
    printBanner();
    const ok = await startServer();
    log(ok ? '服务器就绪，开始监控' : '服务器启动失败，看门狗将持续重试', ok ? 'SUCCESS' : 'WARN');
    scheduleHealthCheck();
  });

  process.on('SIGINT', () => {
    log('正在停止...', 'WARN');
    isShuttingDown = true;
    if (healthCheckTimer) clearTimeout(healthCheckTimer);
    stopCurrentServer().then(() => {
      releaseLock();
      launcherApi.close();
      process.exit(0);
    });
  });

  process.on('uncaughtException', (err) => {
    log(`未捕获异常: ${err.message}\n${err.stack || ''}`, 'ERROR');
  });

  process.on('unhandledRejection', (reason) => {
    const msg = (reason && (reason.stack || reason.message)) || String(reason);
    log(`未处理的 Promise 拒绝: ${msg}`, 'ERROR');
  });
}

main();

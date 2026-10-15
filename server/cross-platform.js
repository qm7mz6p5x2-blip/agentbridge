// ============================================================
// AgentBridge v0.1.1 — 跨平台适配层
//
// 统一 Windows/Linux/Mac/WSL2 差异:
//   - 路径规范化
//   - 命令适配 (cmd / powershell / bash / wsl)
//   - WSL2 检测与路径转换
//   - 权限检测
//   - 文件系统差异处理
// ============================================================

const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const { exec, spawn } = require('child_process');

// 【修复】异步执行命令（Promise 封装），避免 execSync 阻塞事件循环
function execAsync(cmd, opts) {
  return new Promise(function(resolve, reject) {
    exec(cmd, opts, function(err, stdout, stderr) {
      if (err) reject(err);
      else resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

const PLATFORM = {
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  isMac: process.platform === 'darwin',
  platform: process.platform,
  arch: process.arch,
  homeDir: os.homedir(),
  tmpDir: os.tmpdir(),
  hostname: os.hostname(),
  eol: os.EOL,
  pathSep: path.sep,
  cpus: os.cpus().length,
  memoryMB: Math.round(os.totalmem() / (1024 * 1024))
};

// ============================================================
// WSL2 检测与适配
// ============================================================
const WSL = {
  _available: null,
  _distros: null,
  _keepAlive: null,

  // 【修复】异步探测 WSL（不阻塞事件循环），结果写入缓存，仅探测一次
  _detect() {
    if (this._detectPromise) return this._detectPromise;
    if (!PLATFORM.isWindows) {
      this._available = false;
      this._distros = [];
      this._detectPromise = Promise.resolve();
      return this._detectPromise;
    }
    // 用异步 exec 替代 execSync，避免探测 WSL 时阻塞事件循环最长 5 秒
    this._detectPromise = execAsync('wsl --list --quiet', { encoding: 'utf-8', timeout: 5000, windowsHide: true })
      .then((result) => {
        this._available = true;
        // WSL 输出可能含 BOM 和空行，需要清理
        this._distros = (result.stdout || '').split('\n')
          .map(line => line.replace(/[\r\0\u0000-\u001F]/g, '').trim())
          .filter(line => line.length > 0);
      })
      .catch(() => {
        this._available = false;
        this._distros = [];
      });
    return this._detectPromise;
  },

  // 非阻塞预热：服务器启动时调用（勿 await），探测完成后自动填充缓存
  warmup() {
    this._detect().catch(function() {});
  },

  // 检测 WSL 是否可用（仅 Windows 有效；未预热时触发异步探测并返回保守默认值）
  isAvailable() {
    if (this._available !== null) return this._available;
    this._detect().catch(function() {});
    return false;
  },

  // 获取已安装的 WSL 发行版列表（未预热时返回空数组，探测完成后自动填充）
  getDistros() {
    if (this._distros !== null) return this._distros;
    this._detect().catch(function() {});
    return [];
  },

  // 获取默认发行版名称
  getDefaultDistro() {
    const distros = this.getDistros();
    return distros.length > 0 ? distros[0] : 'Ubuntu';
  },

  // Windows 路径 → WSL 路径
  // C:\Users\test\file.txt → /mnt/c/Users/test/file.txt
  winToWsl(winPath) {
    // 已经是 WSL 路径
    if (winPath.startsWith('/mnt/')) return winPath;
    // 统一正斜杠
    const normalized = winPath.replace(/\\/g, '/');
    // 匹配盘符: C:/... → /mnt/c/...
    const driveMatch = normalized.match(/^([a-zA-Z]):(\/.*)/);
    if (driveMatch) {
      return '/mnt/' + driveMatch[1].toLowerCase() + driveMatch[2];
    }
    return normalized;
  },

  // WSL 路径 → Windows 路径
  // /mnt/c/Users/test/file.txt → C:\Users\test\file.txt
  wslToWin(wslPath) {
    // 匹配 /mnt/X/... → X:\...
    const mntMatch = wslPath.match(/^\/mnt\/([a-zA-Z])(\/.*)/);
    if (mntMatch) {
      return mntMatch[1].toUpperCase() + ':' + mntMatch[2].replace(/\//g, '\\');
    }
    return wslPath;
  },

  // 判断路径是否为 WSL 路径（/mnt/...）
  isWslPath(inputPath) {
    return /^\/mnt\/[a-zA-Z]\//.test(inputPath);
  },

  // 判断路径是否在 WSL 原生文件系统中（非 /mnt/）
  isWslNativePath(inputPath) {
    return inputPath.startsWith('/') && !inputPath.startsWith('/mnt/') && !inputPath.startsWith('/proc/') && !inputPath.startsWith('/sys/');
  },

  // 在 WSL 中执行命令
  // 返回 { command: string, shell: boolean } 供 execPromise 使用
  buildWslCommand(command, options) {
    const distro = (options && options.distro) || this.getDefaultDistro();
    const wslCwd = options && options.cwd ? this.winToWsl(options.cwd) : '';
    // 验证 distro 名称，防止命令注入（只允许字母数字、点、连字符）
    if (distro && !/^[a-zA-Z0-9._-]+$/.test(distro)) {
      throw new Error('无效的 WSL 发行版名称: ' + distro);
    }
    // 注意：不使用 chcp 65001 前缀，因为 cmd.exe 不认单引号，会导致 WSL_E_INVALIDARG
    // 编码问题通过 execOptions.encoding = 'utf-8' 在 Node.js 层面解决
    let wslCmd = 'wsl';
    if (distro) wslCmd += ' -d ' + distro;
    // --cd 参数：Linux 路径不含空格时直接拼接，含空格时用双引号包裹（cmd.exe 认双引号）
    if (wslCwd) {
      if (wslCwd.indexOf(' ') >= 0) {
        wslCmd += ' --cd "' + wslCwd + '"';
      } else {
        wslCmd += ' --cd ' + wslCwd;
      }
    }
    // 在 bash 内设置 LANG=C.UTF-8 确保输出为 UTF-8 编码
    // 使用 bash -c "..." 双引号格式（cmd.exe 能正确传递双引号给 wsl）
    var innerCmd = 'export LANG=C.UTF-8; ' + command;
    // 对双引号内的内容进行转义
    innerCmd = innerCmd.replace(/"/g, '\\"');
    wslCmd += ' -- bash -c "' + innerCmd + '"';
    return wslCmd;
  },

  // 获取 WSL 的 HOME 目录（Windows 路径格式，异步避免阻塞事件循环）
  async getWslHomeDir() {
    if (!this.isAvailable()) return null;
    try {
      const result = await execAsync('wsl -- bash -c "echo $HOME"', {
        encoding: 'utf-8', timeout: 5000, windowsHide: true
      });
      const home = (result.stdout || '').trim();
      // 转换为 Windows 路径
      if (home.startsWith('/home/')) {
        return '\\\\wsl$\\' + this.getDefaultDistro() + home.replace(/\//g, '\\');
      }
      return this.wslToWin(home);
    } catch (e) {
      return null;
    }
  },

  // WSL2 VM 保活：常驻一个 sleep 进程，防止 VM 因空闲自动关闭。
  // 背景：WSL2 在最后一个 WSL 进程退出约 8~60 秒后关闭 VM（vmmem），
  //       而 exec_command 之间隔着 AI 思考时间，VM 频繁冷启动导致每次调用 5s+。
  //       实测连发 ~100ms，冷启动 ~5400ms（差 54 倍）。
  // 幂等：重复调用不会重复 spawn；进程意外退出后 3 秒自动重启。
  startKeepAlive() {
    if (!PLATFORM.isWindows || this._keepAlive) return;
    this._detect().then(() => {
      if (!this._available || this._keepAlive) return;
      try {
        const distro = this.getDefaultDistro();
        // 发行版名白名单校验，防止参数注入
        if (!/^[a-zA-Z0-9._-]+$/.test(distro)) return;
        // detached 常驻进程，sleep 极长秒数让 VM 永不因空闲关闭（约 68 年）
        const child = spawn('wsl.exe', ['-d', distro, '--', 'sleep', '2147483647'], {
          windowsHide: true, detached: true, stdio: 'ignore'
        });
        child.unref(); // 不阻塞 Node 进程退出
        child.on('error', () => { this._keepAlive = null; });
        const startedAt = Date.now();
        child.on('exit', (code) => {
          this._keepAlive = null;
          // 启动后很快退出通常表示 WSL 不可用或发行版无法启动。
          // 这种情况下停止重试，避免每 3 秒刷屏并反复创建进程。
          if (Date.now() - startedAt < 5000) {
            console.warn('[WSL] VM 保活启动失败，已停止自动重试 (exit=' + code + ')');
            return;
          }
          // 稳定运行后进程被外部回收时，3 秒后自动恢复保活。
          setTimeout(() => { this.startKeepAlive(); }, 3000);
        });
        this._keepAlive = child;
        console.log('[WSL] VM 保活已启动 (' + distro + ')');
      } catch (e) {
        this._keepAlive = null;
      }
    }).catch(function() {});
  }
};

// Shell 参数转义（平台相关）
function escapeShellArg(str) {
  var s = String(str);
  if (PLATFORM.isWindows) {
    // 【修复】Windows (cmd.exe / PowerShell)：单引号不可靠，改为双引号包裹、内部双引号双写转义
    return '"' + s.replace(/"/g, '""') + '"';
  }
  // POSIX (bash/sh)：单引号包裹，内部单引号用 '\'' 序列
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// ============================================================
// 路径适配
// ============================================================
function normalizePathForPlatform(inputPath) {
  let result = inputPath;
  // 统一分隔符
  result = result.replace(/\\/g, '/');
  // 移除尾部斜线
  result = result.replace(/\/+$/, '');
  return result;
}

function resolveHomeDir(inputPath) {
  if (inputPath.startsWith('~')) {
    const homeDir = os.homedir().replace(/\\/g, '/');
    return homeDir + inputPath.substring(1);
  }
  return inputPath;
}

function isPathWithinWorkspace(filePath, workspaceDir) {
  const resolved = path.resolve(filePath);
  const wsResolved = path.resolve(workspaceDir);
  // 统一路径分隔符后再比较，避免 Windows 下混合分隔符导致误判
  const normalizedResolved = resolved.replace(/\\/g, '/').toLowerCase();
  const normalizedWs = wsResolved.replace(/\\/g, '/').toLowerCase();
  return normalizedResolved.startsWith(normalizedWs + '/') || normalizedResolved === normalizedWs;
}

// 解析路径，支持 WSL 路径格式
// /wsl$/Ubuntu/home/user → WSL 原生路径
// /mnt/c/Users/... → Windows 路径（通过 WSL 访问）
function resolvePathCrossPlatform(inputPath) {
  // WSL 网络路径: \\wsl$\Ubuntu\home\user → Windows 可访问的 UNC 路径
  if (/^\\\\wsl(\$|\.localhost)\\/.test(inputPath) || /^\/\/wsl(\$|\.localhost)\//.test(inputPath)) {
    return inputPath;
  }
  // /mnt/c/... 格式（用户输入 WSL 风格路径，转为 Windows 路径）
  if (WSL.isWslPath(inputPath)) {
    return WSL.wslToWin(inputPath);
  }
  return path.resolve(inputPath);
}

// ============================================================
// 命令适配
// ============================================================
function getShellConfig() {
  if (PLATFORM.isWindows) {
    return {
      shell: true,
      shellPath: 'powershell.exe',
      shellArgs: ['-NoProfile', '-NonInteractive', '-Command'],
      defaultCmd: 'powershell -NoProfile -Command'
    };
  }
  return {
    shell: true,
    shellPath: '/bin/bash',
    shellArgs: ['-c'],
    defaultCmd: '/bin/bash -c'
  };
}

function platformCommand(cmd) {
  if (!cmd || !PLATFORM.isWindows) return cmd;
  // PowerShell 适配: 将 Unix 命令映射到 PowerShell（键为段首命令词）
  const unixToPs = {
    'ls': 'Get-ChildItem',
    'cat': 'Get-Content',
    'rm': 'Remove-Item',
    'cp': 'Copy-Item',
    'mv': 'Move-Item',
    'mkdir': 'New-Item -ItemType Directory',
    'touch': 'New-Item -ItemType File',
    'grep': 'Select-String',
    'find': 'Get-ChildItem -Recurse',
    'pwd': 'Get-Location',
    'echo': 'Write-Output',
    'whoami': 'whoami',
    'sleep': 'Start-Sleep -Seconds',
    'date': 'Get-Date'
  };
  // 【修复】按管道/逻辑连接符（| || && ;）拆分，逐段映射段首命令词，原分隔符原样保留，
  // 支持 cmd1 | cmd2、cmd1 && cmd2、cmd1; cmd2 等多段命令，避免旧实现仅映射整串开头导致的漏映射
  return cmd.split(/(\|\||&&|;|\|)/g).map(function(seg) {
    // 分隔符片段原样保留
    if (/^\s*(\|\||&&|;|\|)\s*$/.test(seg)) return seg;
    const m = seg.match(/^\s*(\S+)/);
    if (!m) return seg;
    const mapped = unixToPs[m[1]];
    if (!mapped) return seg;
    // 仅替换段首命令词，参数与重定向保持不变
    return seg.replace(m[1], mapped);
  }).join('');
}

// ============================================================
// 权限检测
// ============================================================
async function checkWritePermission(targetPath) {
  try {
    const testFile = path.join(targetPath, '.__ds_perm_test_' + Date.now());
    await fsp.writeFile(testFile, 'test', 'utf-8');
    await fsp.unlink(testFile);
    return true;
  } catch (e) {
    return false;
  }
}

async function getFileAttributesForPlatform(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    const result = {
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      isReadable: true,
      isWritable: true,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      permissions: stat.mode.toString(8).slice(-3)
    };

    // 检测可写性
    try {
      result.isWritable = await checkWritePermission(path.dirname(filePath));
    } catch (e) {
      result.isWritable = false;
    }

    return result;
  } catch (e) {
    return { exists: false, error: e.message };
  }
}

// ============================================================
// 系统信息
// ============================================================
function getSystemInfo() {
  const info = {
    ...PLATFORM,
    nodeVersion: process.version,
    uptime: Math.floor(process.uptime()),
    pid: process.pid
  };

  // 添加 WSL 信息
  if (PLATFORM.isWindows) {
    info.wslAvailable = WSL.isAvailable();
    if (info.wslAvailable) {
      info.wslDistros = WSL.getDistros();
      info.wslDefaultDistro = WSL.getDefaultDistro();
    }
  }

  return info;
}

module.exports = {
  PLATFORM,
  WSL,
  normalizePathForPlatform,
  resolveHomeDir,
  isPathWithinWorkspace,
  resolvePathCrossPlatform,
  getShellConfig,
  platformCommand,
  checkWritePermission,
  getFileAttributesForPlatform,
  getSystemInfo
};

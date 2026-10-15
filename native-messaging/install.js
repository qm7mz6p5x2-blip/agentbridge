// Native Host 安装脚本
// 将 native-host.js 和 .bat 启动器部署到 C:\ProgramData\agentbridge\
// 并注册到 Edge/Chrome Native Messaging

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TARGET_DIR = 'C:\\ProgramData\\agentbridge';
const PROJECT_DIR = path.resolve(__dirname, '..');
const NODE_PATH = process.execPath;
const EXT_ID = process.env.AGENTBRIDGE_EXTENSION_ID;
const LOG_PATH = path.join(require('os').tmpdir(), 'ds-native-host.log');

if (!EXT_ID) {
  console.error('请先设置 AGENTBRIDGE_EXTENSION_ID 环境变量');
  process.exit(1);
}

console.log('=== Native Host 安装 ===');
console.log('项目目录: ' + PROJECT_DIR);
console.log('目标目录: ' + TARGET_DIR);

// 1. 创建目标目录
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
  console.log('已创建: ' + TARGET_DIR);
}

// 2. 复制 native-host.js
const srcFile = path.join(PROJECT_DIR, 'native-messaging', 'native-host.js');
const dstFile = path.join(TARGET_DIR, 'native-host.js');
fs.copyFileSync(srcFile, dstFile);
console.log('已复制: native-host.js');

// 3. 创建 .bat 启动器
// 通过 AGENTBRIDGE_HOME 环境变量指向当前项目（部署后 __dirname 不再是项目目录，
// 必须显式注入项目根路径，native-host.js 才能找到 server/launcher.js）
const batContent = '@echo off\r\n'
  + 'set "AGENTBRIDGE_HOME=' + PROJECT_DIR + '"\r\n'
  + '"' + NODE_PATH + '" "' + dstFile + '"\r\n';

const batFile = path.join(TARGET_DIR, 'launch-host.bat');
fs.writeFileSync(batFile, batContent);
console.log('已创建: launch-host.bat');
console.log('  AGENTBRIDGE_HOME: ' + PROJECT_DIR);

// 4. 创建 manifest JSON
const manifest = {
  name: 'com.agentbridge.native',
  description: 'AgentBridge - Native Messaging Host',
  path: batFile,
  type: 'stdio',
  allowed_origins: ['chrome-extension://' + EXT_ID + '/']
};

const manifestFile = path.join(TARGET_DIR, 'com.agentbridge.native.json');
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log('已创建: com.agentbridge.native.json');
console.log('  path: ' + batFile);

// 5. 注册到 Edge 和 Chrome
const regEntries = [
  {
    name: 'Edge',
    path: 'HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.agentbridge.native'
  },
  {
    name: 'Chrome',
    path: 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.agentbridge.native'
  }
];

for (const reg of regEntries) {
  // 使用 PowerShell 单引号方式注册（reg add 在 node execSync 的 cmd 环境下
  // 会因 HKCU: 冒号被解析为盘符而报 Invalid key name）
  try {
    const psCmd = `New-Item -Path '${reg.path}' -Force | Set-ItemProperty -Name '(Default)' -Value '${manifestFile}'`;
    execSync(`powershell -NoProfile -Command "${psCmd.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    console.log('已注册: ' + reg.name);
  } catch (e) {
    console.log('注册失败: ' + reg.name + ' - 请手动注册');
    console.log('  注册表路径: ' + reg.path);
    console.log('  默认值: ' + manifestFile);
  }
}

console.log('');
console.log('=== 安装完成 ===');
console.log('');
console.log('重要提示:');
console.log('1. 必须通过 .bat 文件启动（直接 node.exe 会导致管道崩溃）');
console.log('2. 重启浏览器后生效');
console.log('3. 日志文件: ' + LOG_PATH);

// ============================================================
// 配置模块 — 集中管理所有常量、路径、端口、CORS 白名单
//
// 从 tool-server.js 拆分而来，所有模块通过 require('./config') 取配置
// 避免单体中散落的全局 var
// ============================================================
const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.DTA_PORT, 10) || 3004;
const ENGINE_VERSION = '0.1.0';
const SERVER_DIR = path.resolve(__dirname);

const WORKSPACE_DIR = path.resolve(__dirname, '..', 'workspace');
const CONFIG_DIR = path.join(WORKSPACE_DIR, 'config');
const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills');
const PLUGINS_DIR = path.join(WORKSPACE_DIR, 'plugins');
const BUILTIN_SKILLS_DIR = path.join(SERVER_DIR, 'builtin-skills');
const LOGS_DIR = path.join(SERVER_DIR, 'logs');

// 记忆系统目录（pi 资产已迁移到 workspace/memory）
// 环境变量 DTA_PI_MEMORY_DIR 可覆盖，默认读取插件自带的 workspace/memory
const PI_MEMORY_DIR = process.env.DTA_PI_MEMORY_DIR || path.join(WORKSPACE_DIR, 'memory');

// 允许写入的根路径（安全限制：默认仅工作区）
const ALLOWED_WRITE_PATHS = [WORKSPACE_DIR];

// 配置文件路径
const SKILLS_MANIFEST = path.join(CONFIG_DIR, 'skills_manifest.json');
const PERSONALITY_FILE = path.join(CONFIG_DIR, 'personality.json');
const TOOLS_CONFIG = path.join(CONFIG_DIR, 'tools_config.json');

// 默认人格
const DEFAULT_PERSONALITY = {
  name: '默认助手', version: '1.0',
  traits: { style: '专业精确', tone: '友好', verbosity: '适中', creativity: '中等' },
  mission: '', custom_prompt: '',
  created_at: new Date().toISOString()
};

// 默认工具配置
const DEFAULT_TOOLS = [
  { name: 'exec_command', description: '命令行执行', category: 'system', mode: 'manual' },
  { name: 'read_file', description: '读取文件', category: 'io', mode: 'auto' },
  { name: 'write_file', description: '写入文件', category: 'io', mode: 'auto' },
  { name: 'append_file', description: '追加文件', category: 'io', mode: 'auto' },
  { name: 'list_dir', description: '列出目录', category: 'io', mode: 'auto' },
  { name: 'search_files', description: '搜索文件', category: 'io', mode: 'auto' },
  { name: 'get_file_info', description: '文件信息', category: 'io', mode: 'auto' }
];

// 浏览器扩展来源需要通过环境变量显式加入白名单。
// AGENTBRIDGE_EXTENSION_IDS 可填写一个或多个扩展 ID，用逗号分隔。
const ENV_EXTENSION_ORIGINS = (process.env.AGENTBRIDGE_EXTENSION_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => value.startsWith('chrome-extension://') ? value : 'chrome-extension://' + value);

// CORS 白名单
const CORS_WHITELIST = [
  ...ENV_EXTENSION_ORIGINS,
  'https://chat.deepseek.com',
  'https://chat.deepseek.com/',
  'https://chatgpt.com',
  'https://chat.openai.com',
  'https://kimi.com',
  'https://www.kimi.com',
  'https://kimi.moonshot.cn',
  'https://tongyi.aliyun.com',
  'https://qianwen.aliyun.com',
  'https://chat2.qianwen.com',
  'https://chat.qwen.ai',
  'https://www.qianwen.com',
  'https://qianwen.com',
  'https://chatglm.cn',
  'https://chat.z.ai',
  'https://z.ai',
  'https://www.doubao.com',
  'https://doubao.com',
  'http://localhost:3004'
];

// HTTP 保护
const MAX_BODY_SIZE = 10 * 1024 * 1024;   // 请求体最大 10MB
const BODY_TIMEOUT_MS = 30000;            // 请求体接收超时 30 秒
const REQUEST_TIMEOUT_MS = 60000;         // 请求超时保护 60 秒

// 飞书（跨平台 lark-cli 路径）
const LARK_CLI = process.platform === 'win32'
  ? path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli.exe')
  : path.join((process.env.HOME || '/usr/local'), '.npm-global', 'lib', 'node_modules', '@larksuite', 'cli', 'bin', 'lark-cli');
// 【修复】子进程超时时间（毫秒）
const CHILD_PROCESS_TIMEOUT_MS = 30000;

module.exports = {
  PORT,
  ENGINE_VERSION,
  SERVER_DIR,
  WORKSPACE_DIR,
  CONFIG_DIR,
  MEMORY_DIR,
  SKILLS_DIR,
  PLUGINS_DIR,
  BUILTIN_SKILLS_DIR,
  LOGS_DIR,
  PI_MEMORY_DIR,
  ALLOWED_WRITE_PATHS,
  SKILLS_MANIFEST,
  PERSONALITY_FILE,
  TOOLS_CONFIG,
  DEFAULT_PERSONALITY,
  DEFAULT_TOOLS,
  CORS_WHITELIST,
  MAX_BODY_SIZE,
  BODY_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  LARK_CLI,
  CHILD_PROCESS_TIMEOUT_MS
};

// ============================================================
// 插件管理工具注册 — plugin_list / plugin_install / plugin_install_url / plugin_reload / plugin_uninstall
//
// 依赖注入：registerPluginManagerTools(toolRegistry, pluginRegistry, deps)
//   deps: { pluginsDir, confirmedCtx }
// ============================================================
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * @param {import('./tool-registry').ToolRegistry} toolRegistry
 * @param {import('./plugin-loader').PluginRegistry} pluginRegistry
 * @param {object} deps - { pluginsDir }
 */
function registerPluginManagerTools(toolRegistry, pluginRegistry, deps) {
  const PLUGINS_DIR = deps.pluginsDir;

  toolRegistry.registerTool(function (ctx) {
    return [
      {
        name: 'plugin_list',
        label: 'List Plugins',
        description: '列出所有已安装插件及其状态。参数: 无',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async function () {
          var plugins = pluginRegistry.plugins.map(function (p) {
            var tools = [];
            var pluginTools = toolRegistry.listTools().filter(function (t) { return t.pluginId === p.id; });
            pluginTools.forEach(function (t) { tools.push(t.name); });
            return {
              id: p.id,
              name: p.name,
              version: p.version,
              kind: p.kind,
              origin: p.origin,
              loaded: p.loaded,
              tools: tools
            };
          });
          return [{ type: 'text', text: JSON.stringify({
            success: true,
            tool: 'plugin_list',
            count: plugins.length,
            plugins: plugins
          }) }];
        }
      },
      {
        name: 'plugin_install',
        label: 'Install Plugin',
        description: '安装新插件：创建 plugin.json + index.js 并自动加载。参数: id(插件ID), name(插件名), description(描述), kind(类型:tool/memory), tools(工具名数组), code(index.js源码)',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '插件唯一ID' },
            name: { type: 'string', description: '插件显示名称' },
            description: { type: 'string', description: '插件描述' },
            kind: { type: 'string', description: '插件类型: tool 或 memory' },
            tools: { type: 'array', description: '工具名列表,如["my_tool"]' },
            code: { type: 'string', description: 'index.js 完整源码 (Node.js)' }
          },
          required: ['id', 'name', 'code']
        },
        execute: async function (_toolCallId, args) {
          // 验证插件ID，防止路径穿越
          if (!args.id || !/^[a-zA-Z0-9_-]+$/.test(args.id)) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install', error: '插件ID只能包含字母、数字、下划线和连字符' }) }];
          }
          // 安全检查: 插件安装需要用户确认，防止远程代码注入
          if (!ctx._confirmed) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'plugin_install',
              error: '插件安装需要用户确认，不可自动执行',
              needsConfirmation: true
            }) }];
          }
          try {
            var pluginDir = path.join(PLUGINS_DIR, args.id);
            var manifest = {
              id: args.id,
              name: args.name,
              version: '1.0.0',
              description: args.description || '',
              entry: 'index.js',
              requiredEngineVersion: '^0.1.0',
              tools: args.tools || [],
              kind: args.kind || 'tool'
            };

            await fs.mkdir(pluginDir, { recursive: true });
            await fs.writeFile(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8');
            await fs.writeFile(path.join(pluginDir, 'index.js'), args.code, 'utf-8');

            var discovered = await pluginRegistry.discover();
            var loaded = false;
            for (var i = 0; i < discovered.length; i++) {
              if (discovered[i].id === args.id || discovered[i].source === pluginDir) {
                loaded = await pluginRegistry.load(discovered[i]);
                break;
              }
            }

            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'plugin_install',
              pluginId: args.id,
              loaded: loaded,
              path: pluginDir,
              message: loaded ? '插件已安装并加载' : '插件已安装但加载失败，检查index.js语法'
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'plugin_install',
              error: e.message
            }) }];
          }
        }
      },
      {
        name: 'plugin_install_url',
        label: 'Install Plugin from URL',
        description: '从 URL 下载并安装插件包。支持 GitHub 仓库或 zip 包。参数: url(插件地址), id(插件ID)',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '插件包 URL（GitHub 仓库地址或 zip 包地址）' },
            id: { type: 'string', description: '插件唯一ID' }
          },
          required: ['url', 'id']
        },
        execute: async function (_toolCallId, args) {
          if (!args.id || !/^[a-zA-Z0-9_-]+$/.test(args.id)) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install_url', error: '插件ID只能包含字母、数字、下划线和连字符' }) }];
          }
          if (!ctx._confirmed) {
            return [{ type: 'text', text: JSON.stringify({
              success: false, tool: 'plugin_install_url',
              error: '从 URL 安装插件需要用户确认', needsConfirmation: true
            }) }];
          }
          try {
            var pluginDir = path.join(PLUGINS_DIR, args.id);
            // 检查是否已存在
            try { await fs.access(pluginDir); return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install_url', error: '插件 ' + args.id + ' 已存在，请先卸载' }) }]; } catch (e) {}

            var fetchUrl = args.url;
            // GitHub 仓库地址转换为 zip 下载链接
            if (fetchUrl.match(/^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/)) {
              fetchUrl = fetchUrl.replace(/\/$/, '') + '/archive/refs/heads/main.zip';
            }

            // 下载
            var https = require('https');
            var http = require('http');
            var client = fetchUrl.startsWith('https') ? https : http;

            var zipData = await new Promise(function(resolve, reject) {
              client.get(fetchUrl, { timeout: 30000 }, function(res) {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  // 跟随重定向
                  var redirectClient = res.headers.location.startsWith('https') ? https : http;
                  redirectClient.get(res.headers.location, { timeout: 30000 }, function(res2) {
                    var chunks = [];
                    res2.on('data', function(c) { chunks.push(c); });
                    res2.on('end', function() { resolve(Buffer.concat(chunks)); });
                  }).on('error', reject);
                } else {
                  var chunks = [];
                  res.on('data', function(c) { chunks.push(c); });
                  res.on('end', function() { resolve(Buffer.concat(chunks)); });
                }
              }).on('error', reject);
            });

            // 保存 zip 并解压
            var tmpZip = path.join(os.tmpdir(), 'plugin_' + args.id + '.zip');
            await fs.writeFile(tmpZip, zipData);

            // 使用 Node.js 内置解压（或 fallback 到系统 unzip）
            var tmpDir = path.join(os.tmpdir(), 'plugin_' + args.id);
            await fs.mkdir(tmpDir, { recursive: true });

            try {
              // 尝试用 child_process 解压
              var { execFileSync } = require('child_process');
              if (process.platform === 'win32') {
                execFileSync('powershell', ['-Command', 'Expand-Archive', '-Path', tmpZip, '-DestinationPath', tmpDir, '-Force'], { timeout: 15000 });
              } else {
                execFileSync('unzip', ['-o', tmpZip, '-d', tmpDir], { timeout: 15000 });
              }
            } catch (e) {
              return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install_url', error: '解压失败: ' + e.message }) }];
            }

            // 查找 plugin.json（可能在子目录中）
            var foundDir = null;
            var entries = await fs.readdir(tmpDir, { withFileTypes: true });
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].isDirectory()) {
                try {
                  await fs.access(path.join(tmpDir, entries[i].name, 'plugin.json'));
                  foundDir = path.join(tmpDir, entries[i].name);
                  break;
                } catch (e) {}
              }
            }
            if (!foundDir) {
              try { await fs.access(path.join(tmpDir, 'plugin.json')); foundDir = tmpDir; } catch (e) {}
            }
            if (!foundDir) {
              return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install_url', error: '下载的包中未找到 plugin.json' }) }];
            }

            // 复制到插件目录
            await fs.mkdir(pluginDir, { recursive: true });
            var files = await fs.readdir(foundDir, { withFileTypes: true });
            for (var i = 0; i < files.length; i++) {
              var srcFile = path.join(foundDir, files[i].name);
              var dstFile = path.join(pluginDir, files[i].name);
              if (files[i].isDirectory()) {
                var { execFileSync: cp } = require('child_process');
                if (process.platform === 'win32') {
                  cp('xcopy', [srcFile, dstFile + '\\', '/E', '/I', '/Y'], { timeout: 10000 });
                } else {
                  cp('cp', ['-r', srcFile, dstFile], { timeout: 10000 });
                }
              } else {
                await fs.copyFile(srcFile, dstFile);
              }
            }

            // 清理临时文件
            try { await fs.unlink(tmpZip); } catch (e) {}
            try {
              var { execFileSync: rm } = require('child_process');
              if (process.platform === 'win32') {
                rm('rmdir', ['/S', '/Q', tmpDir], { timeout: 10000 });
              } else {
                rm('rm', ['-rf', tmpDir], { timeout: 10000 });
              }
            } catch (e) {}

            // 加载插件
            var discovered = await pluginRegistry.discover();
            var loaded = false;
            for (var i = 0; i < discovered.length; i++) {
              if (discovered[i].id === args.id || discovered[i].source === pluginDir) {
                loaded = await pluginRegistry.load(discovered[i]);
                break;
              }
            }

            return [{ type: 'text', text: JSON.stringify({
              success: true, tool: 'plugin_install_url',
              pluginId: args.id, loaded: loaded, path: pluginDir,
              message: loaded ? '插件已从 URL 安装并加载' : '插件已下载但加载失败，检查 plugin.json 和 index.js'
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_install_url', error: e.message }) }];
          }
        }
      },
      {
        name: 'plugin_reload',
        label: 'Reload Plugins',
        description: '重新扫描并加载所有插件（热重载）。参数: 无',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async function () {
          try {
            // 先卸载所有已加载的插件（清理工具注册）
            var existingIds = [];
            for (var [pid] of pluginRegistry._plugins) { existingIds.push(pid); }
            for (var i = 0; i < existingIds.length; i++) {
              await pluginRegistry.unload(existingIds[i]);
            }
            var discovered = await pluginRegistry.discover();
            var loadedCount = 0;
            for (var i = 0; i < discovered.length; i++) {
              if (await pluginRegistry.load(discovered[i])) loadedCount++;
            }
            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'plugin_reload',
              unloaded: existingIds.length,
              total: discovered.length,
              loaded: loadedCount,
              failed: discovered.length - loadedCount,
              diagnostics: pluginRegistry.diagnosticMessages,
              message: '已卸载 ' + existingIds.length + ' 个旧插件，重载 ' + loadedCount + '/' + discovered.length + ' 个插件'
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'plugin_reload',
              error: e.message
            }) }];
          }
        }
      },
      {
        name: 'plugin_uninstall',
        label: 'Uninstall Plugin',
        description: '卸载插件（删除目录）。参数: id(插件ID)',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '插件ID' }
          },
          required: ['id']
        },
        execute: async function (_toolCallId, args) {
          // 验证插件ID，防止路径穿越
          if (!args.id || !/^[a-zA-Z0-9_-]+$/.test(args.id)) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'plugin_uninstall', error: '插件ID只能包含字母、数字、下划线和连字符' }) }];
          }
          try {
            var pluginDir = path.join(PLUGINS_DIR, args.id);
            var existed = false;
            try { await fs.access(pluginDir); existed = true; } catch (e) {}
            if (!existed) {
              return [{ type: 'text', text: JSON.stringify({
                success: true,
                tool: 'plugin_uninstall',
                pluginId: args.id,
                message: '插件目录不存在，无需卸载'
              }) }];
            }
            await pluginRegistry.unload(args.id);
            await removeDir(pluginDir);
            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'plugin_uninstall',
              pluginId: args.id,
              message: '插件已卸载'
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'plugin_uninstall',
              error: e.message
            }) }];
          }
        }
      }
    ];
  });

  console.log('[ToolServer] 已注册 5 个插件管理工具: plugin_list, plugin_install, plugin_install_url, plugin_reload, plugin_uninstall');
}

// 递归删除目录（局部辅助）
async function removeDir(dirPath) {
  var entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var full = path.join(dirPath, entries[i].name);
    if (entries[i].isDirectory()) await removeDir(full);
    else await fs.unlink(full);
  }
  await fs.rmdir(dirPath);
}

module.exports = { registerPluginManagerTools };

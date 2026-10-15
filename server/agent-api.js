// ============================================================
// Agent API 模块 — personality / memory / tools / quick-actions / status / pi-summary
//
// 从 tool-server.js 拆分而来。通过 createAgentApi(deps) 工厂注入依赖：
//   deps: { toolRegistry, pluginRegistry, skills, crossPlatform, piMemory }
// 避免单体全局变量耦合，便于测试。
// ============================================================
const fs = require('fs').promises;
const path = require('path');
const {
  WORKSPACE_DIR, MEMORY_DIR, CONFIG_DIR,
  PERSONALITY_FILE, TOOLS_CONFIG,
  DEFAULT_PERSONALITY, DEFAULT_TOOLS,
  PI_MEMORY_DIR, ENGINE_VERSION
} = require('./config');
const { readJsonFile, writeJsonFile, withFileLock } = require('./fs-utils');

function createAgentApi(deps) {
  const { toolRegistry, pluginRegistry, skills, crossPlatform, piMemory, permissionPolicy } = deps;

  return {

    async status() {
      var personality, memoryInited, tools, skillsData;
      try { personality = await readJsonFile(PERSONALITY_FILE, DEFAULT_PERSONALITY); } catch (e) { personality = DEFAULT_PERSONALITY; }
      try { await fs.access(path.join(MEMORY_DIR, 'memory_init.json')); memoryInited = true; } catch (e) { memoryInited = false; }
      try { tools = await readJsonFile(TOOLS_CONFIG, DEFAULT_TOOLS); } catch (e) { tools = DEFAULT_TOOLS; }
      try { skillsData = await skills.getSkillsWithStatus(); } catch (e) { skillsData = { skills: [], custom_skills: [] }; }

      var allTools = toolRegistry.listTools();
      var sysInfo = crossPlatform.getSystemInfo();

      return {
        success: true, initialized: memoryInited, workspace: WORKSPACE_DIR,
        personality: personality, tools: tools, tools_available: allTools,
        skills: skillsData.skills, custom_skills: skillsData.custom_skills,
        plugins: pluginRegistry.plugins.map(function(p) { return { id: p.id, name: p.name, version: p.version, kind: p.kind, origin: p.origin }; }),
        plugin_diagnostics: pluginRegistry.diagnosticMessages,
        server: {
          pid: process.pid, uptime: Math.floor(process.uptime()),
          platform: sysInfo.platform, arch: sysInfo.arch,
          nodeVersion: sysInfo.nodeVersion, cpus: sysInfo.cpus,
          memoryMB: sysInfo.memoryMB, version: ENGINE_VERSION
        }
      };
    },

    // pi 记忆系统核心摘要（异步 + 缓存，避免同步 I/O 阻塞事件循环）
    async pi_summary(limitPerFile) {
      return await piMemory.piSummary(limitPerFile);
    },

    async personality_get() {
      try { return { success: true, personality: await readJsonFile(PERSONALITY_FILE, DEFAULT_PERSONALITY) }; }
      catch (e) { return { success: true, personality: DEFAULT_PERSONALITY }; }
    },

    async personality_save(personality) {
      if (!personality || typeof personality !== 'object') throw new Error('无效的人格配置');
      // 【修复】加锁串行化读改写，避免并发保存丢失数据
      return withFileLock(PERSONALITY_FILE, async function() {
        var existing = await readJsonFile(PERSONALITY_FILE, DEFAULT_PERSONALITY);
        var merged = { ...existing, ...personality, traits: { ...existing.traits, ...(personality.traits || {}) }, updated_at: new Date().toISOString() };
        await writeJsonFile(PERSONALITY_FILE, merged);
        return { success: true, personality: merged };
      });
    },

    async personality_reset() {
      // 【修复】加锁串行化，避免与保存操作交错
      return withFileLock(PERSONALITY_FILE, async function() {
        await writeJsonFile(PERSONALITY_FILE, { ...DEFAULT_PERSONALITY, created_at: new Date().toISOString() });
        return { success: true, personality: DEFAULT_PERSONALITY };
      });
    },

    async memory_init() {
      await fs.mkdir(MEMORY_DIR, { recursive: true });
      var initFile = path.join(MEMORY_DIR, 'memory_init.json');
      var initData = { initialized: true, created_at: new Date().toISOString(), description: 'Agent 记忆存储目录' };
      await writeJsonFile(initFile, initData);
      return { success: true, memory: initData };
    },

    async memory_save(key, data) {
      if (!key) throw new Error('缺少 key 参数');
      var memFile = path.join(MEMORY_DIR, key.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_') + '.json');
      var entry = { key: key, data: data, saved_at: new Date().toISOString() };
      await writeJsonFile(memFile, entry);
      return { success: true };
    },

    async memory_load() {
      var initData = await readJsonFile(path.join(MEMORY_DIR, 'memory_init.json'), { initialized: false });
      var entries = [];
      try {
        var files = await fs.readdir(MEMORY_DIR);
        for (var i = 0; i < files.length; i++) {
          if (files[i] === 'memory_init.json' || !files[i].endsWith('.json')) continue;
          try { entries.push(await readJsonFile(path.join(MEMORY_DIR, files[i]))); } catch (e) {}
        }
      } catch (e) {}
      return { success: true, memory: initData, entries: entries, entry_count: entries.length };
    },

    async memory_clear() {
      try {
        var files = await fs.readdir(MEMORY_DIR);
        for (var i = 0; i < files.length; i++) { try { await fs.unlink(path.join(MEMORY_DIR, files[i])); } catch (e) {} }
      } catch (e) {}
      return { success: true };
    },

    async tools_list() {
      try {
        var tools = await readJsonFile(TOOLS_CONFIG, DEFAULT_TOOLS);
        if (permissionPolicy) {
          tools = tools.map(function (tool) {
            return {
              ...tool,
              mode: permissionPolicy.config.tools[tool.name] || permissionPolicy.config.defaultMode
            };
          });
        }
        return { success: true, tools: tools };
      } catch (e) { return { success: true, tools: DEFAULT_TOOLS }; }
    },

    async tools_set_mode(name, mode) {
      if (['off', 'manual', 'auto'].indexOf(mode) === -1) throw new Error('mode 必须是 off, manual 或 auto');
      if (permissionPolicy) {
        await permissionPolicy.setToolMode(name, mode);
      }
      // 【修复】加锁串行化读改写，避免并发修改丢失
      return withFileLock(TOOLS_CONFIG, async function() {
        var tools = DEFAULT_TOOLS;
        try { tools = await readJsonFile(TOOLS_CONFIG, tools); } catch (e) {}
        var tool = tools.find(function(t) { return t.name === name; });
        if (!tool) throw new Error('未找到工具: ' + name);
        tool.mode = mode;
        await writeJsonFile(TOOLS_CONFIG, tools);
        return { success: true };
      });
    },

    async tools_create(tool) {
      if (!tool || !tool.name) throw new Error('缺少 tool.name 参数');
      // 【修复】加锁串行化读改写
      return withFileLock(TOOLS_CONFIG, async function() {
        var tools = DEFAULT_TOOLS;
        try { tools = await readJsonFile(TOOLS_CONFIG, tools); } catch (e) {}
        if (tools.find(function(t) { return t.name === tool.name; })) throw new Error('工具 ' + tool.name + ' 已存在');
        tools.push({ name: tool.name, description: tool.description || '', category: tool.category || 'custom', mode: tool.mode || tool.defaultMode || 'manual' });
        await writeJsonFile(TOOLS_CONFIG, tools);
        return { success: true, tool: tools[tools.length - 1] };
      });
    },

    async tools_delete(name) {
      if (!name) throw new Error('缺少 name 参数');
      // 【修复】加锁串行化读改写
      return withFileLock(TOOLS_CONFIG, async function() {
        var tools = DEFAULT_TOOLS;
        try { tools = await readJsonFile(TOOLS_CONFIG, tools); } catch (e) {}
        var idx = tools.findIndex(function(t) { return t.name === name; });
        if (idx < 0) throw new Error('未找到工具: ' + name);
        tools.splice(idx, 1);
        await writeJsonFile(TOOLS_CONFIG, tools);
        return { success: true, message: '工具 ' + name + ' 已删除' };
      });
    },

    async quick_actions_get() {
      var configFile = path.join(CONFIG_DIR, 'quick_actions.json');
      // 默认值与 workspace/config/quick_actions.json 保持一致：
      // 均为日常办公高频任务，且引用的 memory 文件真实存在
      var defaults = [
        { label: '总结并记录', prompt: '请总结本次会话的关键内容、决策和待办，将重要信息整理写入记忆（workspace/memory 下的 daily 日志和 MEMORY.md）。先读再写，用追加/局部修改方式更新，不要整文件覆盖已有内容。' },
        { label: '今日日报', prompt: '请读取记忆（workspace/memory/daily 下今天及最近的日志），结合本次会话内容，生成一份今日日报：今日完成、关键成果、遗留问题、明日计划。' },
        { label: '整理会议纪要', prompt: '请将本次对话中的会议内容整理为结构化纪要：主题、讨论要点、决策、待办项（含负责人与时限）、下一步行动。' },
        { label: '起草周报', prompt: '请读取记忆（workspace/memory/daily 最近 7 天的日志），生成一份周报草稿：本周完成、进展与数据、遇到的问题、下周计划。' }
      ];
      try { return { success: true, actions: await readJsonFile(configFile, defaults) }; }
      catch (e) { return { success: true, actions: defaults }; }
    },

    async quick_actions_save(actions) {
      if (!Array.isArray(actions) || actions.length > 5) throw new Error('快捷操作最多5个');
      for (var i = 0; i < actions.length; i++) {
        var a = actions[i];
        if (!a || typeof a !== 'object') throw new Error('快捷操作格式无效');
        if (typeof a.label !== 'string' || !a.label.trim()) throw new Error('快捷操作[' + i + ']缺少label');
        if (typeof a.prompt !== 'string' || !a.prompt.trim()) throw new Error('快捷操作[' + i + ']缺少prompt');
        a.label = a.label.trim().substring(0, 50);
        a.prompt = a.prompt.trim().substring(0, 2000);
      }
      var configFile = path.join(CONFIG_DIR, 'quick_actions.json');
      // 【修复】加锁串行化写操作，避免并发保存丢失
      return withFileLock(configFile, async function() {
        await writeJsonFile(configFile, actions);
        return { success: true };
      });
    }
  };
}

module.exports = { createAgentApi };

// ============================================================
// 技能系统核心逻辑 — 扫描 / 加载 / 列表 / 创建 / 启用禁用 / 删除 / 热加载
// ============================================================
const fs = require('fs').promises;
const path = require('path');
const { SKILLS_DIR, CONFIG_DIR, SKILLS_MANIFEST } = require('./config');
const { readJsonFile, writeJsonFile, parseYamlFrontmatter } = require('./fs-utils');
const { appendLog } = require('./logger');

// 技能目录热加载：监听文件变化，自动重新扫描
var _skillsWatcher = null;
var _skillsWatcherTimer = null;
var _fsNative = require('fs');  // 原始 fs 模块（用于 fs.watch）

function startSkillsWatcher() {
  try {
    _skillsWatcher = _fsNative.watch(SKILLS_DIR, { recursive: true }, function(eventType, filename) {
      if (!filename) return;
      // 只关注 SKILL.md 文件变化
      if (!filename.endsWith('SKILL.md') && !filename.endsWith('SKILL.md~')) return;
      // 防抖：500ms 内只触发一次
      if (_skillsWatcherTimer) clearTimeout(_skillsWatcherTimer);
      _skillsWatcherTimer = setTimeout(async function() {
        _skillsWatcherTimer = null;
        try {
          var skills = await scanSkillsDir();
          console.log('[Skills] 检测到技能文件变化，重新扫描: ' + skills.length + ' 个技能');
        } catch (e) {
          console.error('[Skills] 热加载扫描失败:', e.message);
        }
      }, 500);
    });
    _skillsWatcher.on('error', function() { /* 忽略监听错误 */ });
    console.log('[Skills] 热加载监听已启动: ' + SKILLS_DIR);
  } catch (e) {
    console.log('[Skills] 热加载监听启动失败(不影响功能): ' + e.message);
  }
}

async function scanSkillsDir() {
  var skillDirs = [];
  try {
    var entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isDirectory()) continue;
      // 一级目录：直接检查 SKILL.md
      var skillMdPath = path.join(SKILLS_DIR, entries[i].name, 'SKILL.md');
      try { await fs.access(skillMdPath); skillDirs.push(entries[i].name); } catch (e) {
        // 二级目录：扫描子目录中的 SKILL.md（如 lark/lark-doc/SKILL.md）
        try {
          var subEntries = await fs.readdir(path.join(SKILLS_DIR, entries[i].name), { withFileTypes: true });
          for (var j = 0; j < subEntries.length; j++) {
            if (!subEntries[j].isDirectory()) continue;
            var subSkillMd = path.join(SKILLS_DIR, entries[i].name, subEntries[j].name, 'SKILL.md');
            try { await fs.access(subSkillMd); skillDirs.push(entries[i].name + '/' + subEntries[j].name); } catch (e2) {}
          }
        } catch (e2) {}
      }
    }
  } catch (e) {}
  return skillDirs;
}

async function loadSkillInfo(skillName) {
  var skillDir = path.join(SKILLS_DIR, skillName);
  var skillMdPath = path.join(skillDir, 'SKILL.md');
  try {
    var content = await fs.readFile(skillMdPath, 'utf-8');
    var parsed = parseYamlFrontmatter(content);
    return {
      name: parsed.frontmatter.name || skillName,
      description: parsed.frontmatter.description || '',
      content: parsed.body,
      filename: 'SKILL.md'
    };
  } catch (e) { return null; }
}

async function getSkillsWithStatus() {
  var manifest = await readJsonFile(SKILLS_MANIFEST, { enabled_skills: [], custom_skills: [] });
  var dirs = await scanSkillsDir();
  var skills = [];
  for (var i = 0; i < dirs.length; i++) {
    var info = await loadSkillInfo(dirs[i]);
    if (!info) continue;
    var enabledEntry = manifest.enabled_skills.find(function(s) { return s.name === dirs[i]; });
    var enabled = enabledEntry ? enabledEntry.enabled : false;
    var isCustom = manifest.custom_skills.some(function(s) { return s.name === dirs[i]; });
    skills.push({ name: info.name, description: info.description, content: info.content, dirName: dirs[i], enabled: enabled, isCustom: isCustom, filename: info.filename });
  }
  return { skills: skills, custom_skills: skills.filter(function(s) { return s.isCustom; }) };
}

async function skills_list() {
  try {
    var result = await getSkillsWithStatus();
    return { success: true, skills: result.skills, custom_skills: result.custom_skills };
  } catch (e) { return { success: true, skills: [], custom_skills: [] }; }
}

async function skills_create(name, description, content) {
  if (!name) throw new Error('缺少 name 参数');
  if (!content) throw new Error('缺少 content 参数');
  var safeName = name.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, '_').substring(0, 64);
  var skillDir = path.join(SKILLS_DIR, safeName);
  try { await fs.access(skillDir); throw new Error('技能 ' + safeName + ' 已存在'); } catch (e) { if (e.message.includes('已存在')) throw e; }
  var frontmatter = '---\nname: ' + safeName + '\ndescription: ' + (description || '') + '\n---\n\n';
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, 'SKILL.md'), frontmatter + content, 'utf-8');
  var manifest = await readJsonFile(SKILLS_MANIFEST, { enabled_skills: [], custom_skills: [] });
  manifest.custom_skills = manifest.custom_skills || [];
  manifest.custom_skills.push({ name: safeName, description: description || '', enabled: true, filename: 'SKILL.md' });
  await writeJsonFile(SKILLS_MANIFEST, manifest);
  await appendLog('INFO', '技能已创建: ' + safeName);
  return { success: true, skill: { name: safeName, description: description || '' } };
}

// 【修复】安全辅助函数：校验名称参数，防止路径穿越攻击
function validateSafeName(name, label) {
  if (!name || !/^[a-zA-Z0-9_\-\/\u4e00-\u9fff]+$/.test(name)) {
    throw new Error((label || '名称') + '只能包含字母、数字、下划线、连字符、斜杠和中文');
  }
  // 防止路径穿越：不允许 .. 和连续斜杠
  if (name.indexOf('..') >= 0 || name.indexOf('//') >= 0 || name.indexOf('\\') >= 0) {
    throw new Error((label || '名称') + '包含非法路径字符');
  }
  return name;
}

async function skills_toggle(name, enabled) {
  // 【修复】校验技能名称，防止路径穿越
  validateSafeName(name, '技能名称');
  var skillDir = path.join(SKILLS_DIR, name);
  // 【修复】二次校验：确保解析后的路径仍在 SKILLS_DIR 内
  if (!skillDir.startsWith(SKILLS_DIR + path.sep) && skillDir !== SKILLS_DIR) {
    throw new Error('非法路径');
  }
  try { await fs.access(path.join(skillDir, 'SKILL.md')); } catch (e) { throw new Error('技能不存在: ' + name); }
  var manifest = await readJsonFile(SKILLS_MANIFEST, { enabled_skills: [], custom_skills: [] });
  var idx = manifest.enabled_skills.findIndex(function(s) { return s.name === name; });
  if (idx >= 0) manifest.enabled_skills[idx].enabled = enabled;
  else manifest.enabled_skills.push({ name: name, enabled: enabled });
  await writeJsonFile(SKILLS_MANIFEST, manifest);
  return { success: true, message: '技能 ' + name + ' 已' + (enabled ? '启用' : '禁用') };
}

async function skills_delete(name) {
  // 【修复】校验技能名称，防止路径穿越
  validateSafeName(name, '技能名称');
  var skillDir = path.join(SKILLS_DIR, name);
  // 【修复】二次校验：确保解析后的路径仍在 SKILLS_DIR 内
  if (!skillDir.startsWith(SKILLS_DIR + path.sep) && skillDir !== SKILLS_DIR) {
    throw new Error('非法路径');
  }
  try { await fs.access(skillDir); } catch (e) { throw new Error('技能不存在: ' + name); }
  await fs.rm(skillDir, { recursive: true, force: true });
  var manifest = await readJsonFile(SKILLS_MANIFEST, { enabled_skills: [], custom_skills: [] });
  manifest.custom_skills = (manifest.custom_skills || []).filter(function(s) { return s.name !== name; });
  manifest.enabled_skills = (manifest.enabled_skills || []).filter(function(s) { return s.name !== name; });
  await writeJsonFile(SKILLS_MANIFEST, manifest);
  return { success: true, message: '技能 ' + name + ' 已删除' };
}

module.exports = {
  startSkillsWatcher,
  scanSkillsDir,
  loadSkillInfo,
  getSkillsWithStatus,
  skills_list,
  skills_create,
  skills_toggle,
  skills_delete,
  validateSafeName
};

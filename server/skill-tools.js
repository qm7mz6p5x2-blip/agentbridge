// ============================================================
// 技能管理工具注册 — skill_list / skill_create / skill_toggle
// 依赖注入：registerSkillManagerTools(toolRegistry, skillsApi)
// ============================================================

/**
 * @param {import('./tool-registry').ToolRegistry} toolRegistry
 * @param {object} skillsApi - 来自 skills.js 的核心 API
 */
function registerSkillManagerTools(toolRegistry, skillsApi) {
  toolRegistry.registerTool(function (ctx) {
    return [
      {
        name: 'skill_list',
        label: 'List Skills',
        description: '列出所有已注册技能及其状态。参数: 无',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async function () {
          var result = await skillsApi.skills_list();
          return [{ type: 'text', text: JSON.stringify(result) }];
        }
      },
      {
        name: 'skill_create',
        label: 'Create Skill',
        description: '创建新技能。参数: name(技能名), description(描述), content(Skill.md正文内容)',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名称（英文标识）' },
            description: { type: 'string', description: '技能描述' },
            content: { type: 'string', description: 'SKILL.md 正文内容（Markdown格式）' }
          },
          required: ['name', 'content']
        },
        execute: async function (_toolCallId, args) {
          try {
            await skillsApi.skills_create(args.name, args.description || '', args.content);
            return [{ type: 'text', text: JSON.stringify({ success: true, tool: 'skill_create', name: args.name, message: '技能已创建' }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'skill_create', error: e.message }) }];
          }
        }
      },
      {
        name: 'skill_toggle',
        label: 'Toggle Skill',
        description: '启用或禁用技能。参数: name(技能名), enabled(true/false)',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名称' },
            enabled: { type: 'boolean', description: 'true 启用, false 禁用' }
          },
          required: ['name', 'enabled']
        },
        execute: async function (_toolCallId, args) {
          try {
            await skillsApi.skills_toggle(args.name, args.enabled);
            return [{ type: 'text', text: JSON.stringify({ success: true, tool: 'skill_toggle', name: args.name, enabled: args.enabled, message: '技能已' + (args.enabled ? '启用' : '禁用') }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'skill_toggle', error: e.message }) }];
          }
        }
      }
    ];
  });
  console.log('[ToolServer] 已注册 3 个技能管理工具: skill_list, skill_create, skill_toggle');
}

module.exports = { registerSkillManagerTools };

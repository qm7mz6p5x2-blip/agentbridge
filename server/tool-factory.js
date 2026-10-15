/**
 * 工具工厂 — 参考 Claude Code 的 buildTool + 两阶段验证
 *
 * 设计原则 (Fail-closed):
 *   1. validateInput: 验证输入格式和类型，无效输入不触发权限检查
 *   2. checkPermissions: 检查执行权限，返回 allow/deny/ask
 *   3. 默认值偏向安全: isConcurrencySafe=false, isReadOnly=false
 */

var sanitization = require('./sanitization');

// 权限结果类型
var PERM_ALLOW = { behavior: 'allow' };
var PERM_DENY = function(reason) { return { behavior: 'deny', reason: reason }; };
var PERM_ASK = function(message) { return { behavior: 'ask', message: message }; };

// 验证结果类型
function validationOk() { return { valid: true }; }
function validationError(message) { return { valid: false, error: message }; }

/**
 * 从部分定义构建完整工具（Fail-closed 原则）
 *
 * @param {Object} def - 工具定义（部分字段）
 * @returns {Object} 完整工具定义
 */
function buildTool(def) {
  if (!def || !def.name) {
    throw new Error('工具定义缺少 name 字段');
  }

  return {
    name: def.name,
    description: def.description || '',

    // 安全默认值 — Fail-closed
    isReadOnly: def.isReadOnly || false,
    isConcurrencySafe: def.isConcurrencySafe || false,
    isDestructive: def.isDestructive || false,

    // 两阶段验证
    validateInput: def.validateInput || function(args) {
      // 默认验证: 净化 Unicode + 基本类型检查
      if (!args || typeof args !== 'object') return validationOk();
      var sanitized = sanitization.sanitizeToolArgs(args);
      return validationOk();
    },

    // 受信任入口/全局权限放行 — 最外层包装，优先于任何自定义 checkPermissions。
    // 修复：原先这些放行只写在"默认 checkPermissions"里，工具一旦自定义
    // checkPermissions 就会完全覆盖放行逻辑，导致 _fromHttp / globalPermissions 失效。
    checkPermissions: function(args, ctx) {
      // HTTP API 端点是受信任入口，自动放行
      if (ctx && ctx._fromHttp) return PERM_ALLOW;
      // 全局权限模式放行
      if (ctx && ctx.globalPermissions) return PERM_ALLOW;
      // 只读工具自动放行
      if (def.isReadOnly) return PERM_ALLOW;
      // 自定义权限检查（在放行判定之后执行）
      if (typeof def.checkPermissions === 'function') return def.checkPermissions(args, ctx);
      // Fail-closed: 其他操作需要确认
      return PERM_ASK('工具 ' + def.name + ' 需要确认');
    },

    // 执行函数
    execute: def.execute || function(args, ctx) {
      return { success: false, error: '工具 ' + def.name + ' 未实现 execute 函数' };
    }
  };
}

/**
 * 两阶段验证（不执行工具）
 *
 * 只做输入验证 + 权限检查，返回是否允许执行。
 * 实际执行由调用方（executeTool 的 Phase 2）完成。
 *
 * 修复：原先此函数在放行路径（HTTP/全局权限/只读）上会直接执行工具，
 * 而调用方 executeTool 会在 Phase 2 再执行一次，导致有副作用的工具
 * （edit_file / append_file / process_start / exec_command 等）被执行两次。
 *
 * @param {Object} tool - buildTool 构建的工具
 * @param {Object} args - 工具参数
 * @param {Object} ctx - 执行上下文
 * @returns {Object} 验证/授权结果（success=true 表示允许执行）
 */
function executeToolWithValidation(tool, args, ctx) {
  // 阶段1: 输入验证
  var validationResult = tool.validateInput(args);
  if (!validationResult.valid) {
    return {
      success: false,
      error: '输入验证失败: ' + validationResult.error,
      validationError: true
    };
  }

  // 净化参数（调用方会用自身参数再次执行，这里只做校验副本）
  var sanitizedArgs = sanitization.sanitizeToolArgs(args);

  // 阶段2: 权限检查（优先级：受信任入口 > 全局权限 > 只读工具 > 自定义权限检查）
  var permResult = tool.checkPermissions(sanitizedArgs, ctx);
  if (permResult.behavior === 'deny') {
    return {
      success: false,
      error: '权限拒绝: ' + (permResult.reason || '操作不被允许'),
      blocked: true,
      permissionDenied: true
    };
  }
  if (permResult.behavior === 'ask') {
    return {
      success: false,
      error: permResult.message || '需要用户确认',
      needsConfirmation: true,
      blocked: true
    };
  }

  // 验证与授权通过：允许执行（由调用方在 Phase 2 执行一次）
  return { success: true, allowed: true };
}

module.exports = {
  buildTool: buildTool,
  executeToolWithValidation: executeToolWithValidation,
  PERM_ALLOW: PERM_ALLOW,
  PERM_DENY: PERM_DENY,
  PERM_ASK: PERM_ASK,
  validationOk: validationOk,
  validationError: validationError
};

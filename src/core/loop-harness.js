// ============================================================
// AgentBridge v0.2.0 — Loop Harness (任务级自主循环)
//
// 参考 DeepSeek Harness 的 Agent Loop 极简模式:
//   Agent = Model + Harness
//   - Turn = 一次用户任务（原始消息 → 最终回答）
//   - Step = 一轮 模型请求 → 工具调用 → 结果回注 → 继续请求
//
// 现有 monitor 只按"轮"驱动（SSE/DOM），本模块补充任务级控制:
//   - 任务生命周期: startTurn / recordStep / completeTurn / abortTurn
//   - 循环上限:     每任务最大 step 数，防止无限自转
//   - 失败重试:     同一工具连续失败 N 次 → 生成指令提示 AI 换方法
//   - 断点恢复:     Turn 状态持久化到 localStorage，刷新后可继续
//
// 依赖: DS_CONFIG (config.js), 全局变量
// 加载顺序: 必须在 input-monitor.js 之前加载（见 manifest.json）
// ============================================================

var LOOP_HARNESS = (function() {
  'use strict';

  var PERSIST_KEY = '__ds_loop_turn';

  var config = {
    maxStepsPerTurn: 40,   // 单任务最大 step 数
    maxToolRetries: 3,     // 同一工具连续失败的最大次数
    persist: true
  };

  var turn = null;            // 当前任务对象
  var toolFailures = {};      // { toolName: consecutiveFailCount }

  // 从 DS_CONFIG 同步配置（兼容现有 monitor 设置）
  function loadConfig() {
    try {
      if (typeof DS_CONFIG !== 'undefined' && DS_CONFIG.monitor && DS_CONFIG.monitor.maxToolIterations) {
        config.maxStepsPerTurn = DS_CONFIG.monitor.maxToolIterations;
      }
      if (typeof DS_CONFIG !== 'undefined' && DS_CONFIG.circuitBreaker && DS_CONFIG.circuitBreaker.maxConsecutiveFails) {
        config.maxToolRetries = DS_CONFIG.circuitBreaker.maxConsecutiveFails;
      }
    } catch (e) {}
  }

  // ── 持久化（断点恢复）────────────────────────────
  function persist() {
    if (!config.persist || !turn) return;
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        id: turn.id,
        originalTask: turn.originalTask,
        stepCount: turn.stepCount,
        toolFailures: toolFailures,
        status: turn.status,
        startedAt: turn.startedAt
      }));
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.status !== 'running') return null;
      turn = {
        id: data.id || ('turn_' + Date.now()),
        originalTask: data.originalTask || '',
        stepCount: data.stepCount || 0,
        status: 'running',
        startedAt: data.startedAt || Date.now(),
        restored: true
      };
      toolFailures = data.toolFailures || {};
      return turn;
    } catch (e) { return null; }
  }

  function clearPersist() {
    try { localStorage.removeItem(PERSIST_KEY); } catch (e) {}
  }

  // ── 任务生命周期 ─────────────────────────────────
  // 开始一个任务；若存在未完成的 Turn（刷新后）则恢复
  function startTurn(originalTask) {
    if (turn && turn.status === 'running') return turn;
    var restored = restore();
    if (restored) return restored;
    turn = {
      id: 'turn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      originalTask: originalTask || '',
      stepCount: 0,
      status: 'running',
      startedAt: Date.now(),
      restored: false
    };
    toolFailures = {};
    persist();
    return turn;
  }

  // 记录一轮 step：模型请求 → 工具调用（结果执行后调用）
  function recordStep(toolCalls, results) {
    if (!turn) turn = startTurn('');
    turn.stepCount++;

    if (Array.isArray(toolCalls)) {
      for (var i = 0; i < toolCalls.length; i++) {
        var call = toolCalls[i];
        if (!call || !call.name) continue;
        var res = (results && results[i]) || null;
        var failed = !(res && res.success !== false);
        if (failed) {
          toolFailures[call.name] = (toolFailures[call.name] || 0) + 1;
        } else {
          toolFailures[call.name] = 0;
        }
      }
    }
    persist();
    return turn;
  }

  function isExceeded() {
    return turn && turn.stepCount >= config.maxStepsPerTurn;
  }

  // ── 给 AI 的"继续/重试/终止"指令 ──────────────────
  // 在工具结果注入时调用，追加到发送给模型的消息末尾
  function buildContinueDirective(toolCalls, results) {
    var parts = [];
    var allFailed = true;
    var repeatedTool = null;

    for (var i = 0; i < results.length; i++) {
      var res = results[i];
      var ok = !!(res && res.success !== false);
      if (ok) allFailed = false;
      var call = (toolCalls && toolCalls[i]) || null;
      if (call && call.name && toolFailures[call.name] >= config.maxToolRetries) {
        repeatedTool = call.name;
      }
    }

    // 1. 某工具连续失败超限 → 强制换方法
    if (repeatedTool) {
      parts.push('⚠️ 工具 ' + repeatedTool + ' 已连续失败 ' + toolFailures[repeatedTool] +
        ' 次。请不要重复调用该工具或相同参数，改用其他方法/工具完成任务。');
    }

    // 2. 本轮全部失败
    if (allFailed && results.length > 0) {
      parts.push('本轮所有工具调用均失败。请分析错误原因，调整策略后重试，避免无效重复。');
    }

    // 3. 步数接近/达到上限
    var remain = config.maxStepsPerTurn - (turn ? turn.stepCount : 0);
    if (turn && remain <= 3) {
      parts.push('⚠️ 任务已接近最大步数上限（' + config.maxStepsPerTurn + ' 步），还剩 ' +
        remain + ' 步。请收敛尝试，优先完成任务或总结当前进度。');
    }

    return parts.join('\n');
  }

  // 任务完成（AI 输出最终回答，无更多工具调用）
  function completeTurn() {
    if (turn) turn.status = 'completed';
    turn = null;
    toolFailures = {};
    clearPersist();
  }

  // 任务中止（熔断 / 超限 / 用户停止）
  function abortTurn(reason) {
    if (turn) {
      turn.status = 'aborted';
      turn.abortReason = reason || '';
    }
    turn = null;
    toolFailures = {};
    clearPersist();
  }

  function getTurn() { return turn; }

  loadConfig();
  restore();

  return {
    config: config,
    startTurn: startTurn,
    getTurn: getTurn,
    recordStep: recordStep,
    isExceeded: isExceeded,
    buildContinueDirective: buildContinueDirective,
    completeTurn: completeTurn,
    abortTurn: abortTurn,
    getToolFailures: function() { return toolFailures; }
  };
})();

function parseToolCallContent(content, defaultName) {
  var text = (content || '').trim();

  // 尝试直接解析 JSON
  try {
    var obj = JSON.parse(text);
    if (obj.name && typeof obj.name === 'string') return { tool: obj.name, parameters: obj.arguments || {} };
    if (obj.tool && typeof obj.tool === 'string') return { tool: obj.tool, parameters: obj.parameters || {} };
    if (defaultName && typeof obj === 'object' && Object.keys(obj).length > 0) {
      return { tool: defaultName, parameters: obj };
    }
    if (defaultName) return { tool: defaultName, parameters: {} };
    return null;
  } catch (e) {}

  // 移除字符串字面量后再计算花括号，避免字符串内的花括号污染计数
  function stripStrings(t) {
    return t.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  }

  // 处理 JSON 截断 (常见于流式输出)
  var stripped = stripStrings(text);
  var opens = (stripped.match(/\{/g) || []).length;
  var closes = (stripped.match(/\}/g) || []).length;
  if (opens > closes) {
    try {
      var fixed = JSON.parse(text + '}'.repeat(opens - closes));
      if (fixed.name) return { tool: fixed.name, parameters: fixed.arguments || {} };
      if (fixed.tool) return { tool: fixed.tool, parameters: fixed.parameters || {} };
      if (fixed.arguments) return { tool: defaultName, parameters: fixed.arguments };
      if (fixed.parameters) return { tool: defaultName, parameters: fixed.parameters };
      if (defaultName && typeof fixed === 'object' && Object.keys(fixed).length > 0) {
        return { tool: defaultName, parameters: fixed };
      }
    } catch (e) {
    console.warn('[Parser] JSON修复失败:', e.message, '| 文本:', text.substring(0, 80));
  }
  }

  // 处理常见工具的 fallback
  // 修复：值内允许转义引号 \"，避免被首个引号截断
  if (defaultName) {
    var strVal = '((?:[^"\\\\]|\\\\.)*)';
    if (defaultName === 'exec_command') {
      var cmdMatch = text.match(new RegExp('"command"\\s*:\\s*"' + strVal + '"\\s*[,}]'));
      if (cmdMatch && cmdMatch[1]) return { tool: defaultName, parameters: { command: cmdMatch[1] } };
      return { tool: defaultName, parameters: { command: text.replace(/^["']|["']$/g, '') } };
    }
    if (defaultName === 'read_file' || defaultName === 'write_file' || defaultName === 'append_file' || defaultName === 'get_file_info') {
      var pathMatch = text.match(new RegExp('"path"\\s*:\\s*"' + strVal + '"\\s*[,}]'));
      if (pathMatch && pathMatch[1]) return { tool: defaultName, parameters: { path: pathMatch[1] } };
    }
    if (defaultName === 'search_files') {
      var patternMatch = text.match(new RegExp('"pattern"\\s*:\\s*"' + strVal + '"\\s*[,}]'));
      var rootMatch = text.match(new RegExp('"root"\\s*:\\s*"' + strVal + '"\\s*[,}]'));
      if (patternMatch && patternMatch[1]) return { tool: defaultName, parameters: { pattern: patternMatch[1], root: rootMatch ? rootMatch[1] : '.' } };
    }
    return { tool: defaultName, parameters: {} };
  }

  return null;
}

function parseSingleCall(rawTag) {
  // 格式1: <tool_call name="tool_name">JSON</tool_call>
  var nameMatch = rawTag.match(/name\s*=\s*"([^"]*)"/i);
  var toolName = nameMatch ? nameMatch[1] : null;

  var contentMatch = /<tool_call[^>]*>([\s\S]*?)<\/tool_call>/i.exec(rawTag);
  if (contentMatch) {
    return parseToolCallContent(contentMatch[1], toolName);
  }

  // 格式2: <tool_name>JSON</tool_name> (DeepSeek++ 风格 fallback)
  var xmlNameMatch = rawTag.match(/^<\s*(\/{0,1})([a-zA-Z_][a-zA-Z0-9_]*)>/);
  if (xmlNameMatch) {
    var xmlName = xmlNameMatch[2];
    var isClosing = xmlNameMatch[1];
    if (!isClosing) {
      var closeTag = '<\/' + xmlName + '>';
      var xmlContentMatch = rawTag.match(new RegExp('<' + xmlName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '>([\\s\\S]*?)' + closeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      if (xmlContentMatch) {
        return parseToolCallContent(xmlContentMatch[1], xmlName);
      }
    }
  }

  return null;
}

function parseToolCalls(text) {
  var results = [];

  // 修复 SSE 拦截器丢失的 < 符号
  // DeepSeek SSE 流可能将 <tool_call 拆分为多个 chunk，
  // 导致 SSE 拦截器的 accumulatedText 丢失开头的 <
  // 检测 "tool_call" 前面没有 "<" 的情况，补上 "<"
  var fixedText = String(text || '');

  // 某些页面渲染链路会把标签转义后送回；仅在检测到工具标签实体时解码，
  // 避免无差别改写普通文本中的 HTML 实体。
  if (/&lt;(?:\/?tool_call|task_complete)/i.test(fixedText)) {
    for (var decodePass = 0; decodePass < 2; decodePass++) {
      var beforeDecode = fixedText;
      fixedText = fixedText
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&amp;/gi, '&');
      if (fixedText === beforeDecode) break;
    }
  }

  // 修复开标签: tool_call name=" → <tool_call name="
  fixedText = fixedText.replace(/(^|[^<])(tool_call\s+name=["'])/gi, '$1<$2');
  // 修复闭标签: /tool_call> → </tool_call
  fixedText = fixedText.replace(/(^|[^<])(\/tool_call>)/gi, '$1<$2');
  // 修复模型偶尔漏掉的闭标签 >
  fixedText = fixedText.replace(/<\/tool_call(?![A-Za-z0-9_>])/gi, '</tool_call>');

  // 主格式: <tool_call name="x">...</tool_call</tool_call>
  var regex = /<tool_call[\s\S]*?<\/tool_call>/gi;
  var matches = fixedText.match(regex) || [];

  for (var i = 0; i < matches.length; i++) {
    var parsed = parseSingleCall(matches[i]);
    if (parsed) {
      results.push({ rawTag: matches[i], name: parsed.tool, arguments: parsed.parameters, index: i });
    }
  }

  // 去重：相同工具名+参数只执行一次
  var seen = {};
  var deduped = [];
  // 检测显式任务完成标记
  var taskComplete = /<task_complete[\s\S]*?<\/task_complete>/i.test(fixedText) ||
                     /<task_complete\s*\/>/i.test(fixedText);
  if (taskComplete) {
    // 返回特殊标记，让 monitor 知道任务已完成
    results.push({ rawTag: '<task_complete/>', name: '__task_complete__', arguments: {}, index: -1 });
  }
  for (var j = 0; j < results.length; j++) {
    var key = results[j].name + '::' + JSON.stringify(results[j].arguments || {});
    if (!seen[key]) {
      seen[key] = true;
      deduped.push(results[j]);
    }
  }

  return deduped;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseToolCallContent: parseToolCallContent, parseSingleCall: parseSingleCall, parseToolCalls: parseToolCalls };
}

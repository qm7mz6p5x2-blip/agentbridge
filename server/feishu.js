// ============================================================
// 飞书消息队列 + 回复模块
//
// 从 tool-server.js 拆分而来：
//   - handleFeishuMessages: 监听器收消息后写入队列，前端扩展轮询读取
//   - handleFeishuReply:   通过 lark-cli 向指定 chat 发送文本回复
// ============================================================
const { spawn } = require('child_process');
const { LARK_CLI, CHILD_PROCESS_TIMEOUT_MS } = require('./config');

// 消息队列（内存态）
var feishuQueue = [];

async function handleFeishuMessages(body, method) {
  if (method === 'GET') {
    // 【修复】GET 时自动清理已处理消息，防止内存泄漏
    feishuQueue = feishuQueue.filter(function(m) { return !m.processed; });
    var pending = feishuQueue;
    return { success: true, messages: pending, count: pending.length, queueTotal: feishuQueue.length };
  }
  if (method === 'POST') {
    var msg = {
      id: 'fs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,6),
      senderId: body.senderId || '',
      chatId: body.chatId || '',
      content: body.content || '',
      messageType: body.messageType || 'text',
      timestamp: body.timestamp || Date.now(),
      processed: false,
      receivedAt: Date.now()
    };
    feishuQueue.push(msg);
    if (feishuQueue.length > 200) feishuQueue = feishuQueue.slice(-200);
    console.log('[Feishu] 消息入队:', msg.id, msg.content.substring(0,40));
    return { success: true, id: msg.id };
  }
  if (method === 'PUT' || method === 'PATCH') {
    var found = null;
    for (var i = 0; i < feishuQueue.length; i++) {
      if (feishuQueue[i].id === body.id) { feishuQueue[i].processed = true; found = feishuQueue[i]; break; }
    }
    return { success: !!found, id: body.id, message: found ? '已标记处理' : '未找到' };
  }
  if (method === 'DELETE') {
    feishuQueue = feishuQueue.filter(function(m) { return m.id !== body.id; });
    return { success: true };
  }
  return { success: false, error: '不支持的请求方法' };
}

async function handleFeishuReply(body) {
  if (!body.chatId || !body.text) {
    return { success: false, error: '缺少 chatId 或 text' };
  }

  var text = body.text;
  if (text.length > 4000) text = text.substring(0, 4000) + '...[已截断]';

  return new Promise(function(resolve) {
    var child = spawn(LARK_CLI, [
      'im', '+messages-send',
      '--chat-id', body.chatId,
      '--text', text,
      '--as', 'bot'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    // 【修复】子进程超时保护：超时后强制终止
    var childTimer = setTimeout(function() {
      try { child.kill('SIGKILL'); } catch(e) {}
      resolve({ success: false, error: 'lark-cli 执行超时' });
    }, CHILD_PROCESS_TIMEOUT_MS);

    var stdout = '';
    var stderr = '';
    child.stdout.on('data', function(d) { stdout += d.toString(); });
    child.stderr.on('data', function(d) { stderr += d.toString(); });

    child.on('close', function(code) {
      clearTimeout(childTimer);
      console.log('[Feishu] 回复结果:', code === 0 ? 'OK' : 'FAIL', body.chatId, text.substring(0, 30));
      if (code === 0) {
        try {
          var r = JSON.parse(stdout);
          resolve({ success: true, messageId: r.message_id || (r.data && r.data.message_id) || '' });
        } catch(e) {
          resolve({ success: true, raw: stdout });
        }
      } else {
        resolve({ success: false, error: stderr || stdout, exitCode: code });
      }
    });

    child.on('error', function(e) {
      clearTimeout(childTimer);
      console.log('[Feishu] 回复错误:', e.message);
      resolve({ success: false, error: e.message });
    });
  });
}

module.exports = { handleFeishuMessages, handleFeishuReply };

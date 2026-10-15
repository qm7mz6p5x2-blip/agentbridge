/**
 * 豆包 平台适配器
 */
(function() {
  // 豆包 SSE 主要发送增量 text 帧（patch_op 为累积文本、已在 extractContent 中跳过）。
  // 若整体按累积模式（cumulativeContent:true）处理，增量 text 帧在首帧后
  // content.length 小于已累积长度，会被拦截器判定为重复而全部丢弃，导致回复被截断。
  // 因此统一为增量模式：text/delta 直接透传，content_block（累积）用 deltaOf 转增量。
  var _doubaoLastLen = 0;
  function doubaoDeltaOf(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    if (text.length >= _doubaoLastLen) {
      var d = text.substring(_doubaoLastLen);
      _doubaoLastLen = text.length;
      return d;
    }
    // 内容变短 = 新段/新流开始，重置并返回完整文本
    _doubaoLastLen = text.length;
    return text;
  }

  var doubaoAdapter = {
    id: 'doubao',
    name: '豆包',
    hostPattern: /doubao\.com/,

    sse: {
      apiPattern: /samantha\/chat|\/chat\/completion/,

      extractContent: function(chunk) {
        if (!chunk) return null;
        // 豆包 SSE 数据交替发送 patch_op 和 text 两种格式
        // 优先使用 text（增量文本），忽略 patch_op（累积文本），避免重复
        if (chunk.text) return chunk.text;
        // Samantha 格式: event_type=2001
        if (chunk.event_type === 2001 && chunk.event_data) {
          try {
            var eventData = typeof chunk.event_data === 'string' ? JSON.parse(chunk.event_data) : chunk.event_data;
            if (eventData.message && eventData.message.content) {
              try {
                var content = typeof eventData.message.content === 'string' ? JSON.parse(eventData.message.content) : eventData.message.content;
                if (content.text) return content.text;
                if (typeof content === 'string') return content;
              } catch(e) {
                return eventData.message.content;
              }
            }
          } catch(e) {}
        }
        // 注意：patch_op 格式包含累积文本，与 text 增量文本重复，跳过
        // content_block 格式（累积文本 → 增量）
        if (chunk.content && chunk.content.content_block) {
          var texts = [];
          for (var j = 0; j < chunk.content.content_block.length; j++) {
            var block = chunk.content.content_block[j];
            if (block.content && block.content.text_block && block.content.text_block.text) {
              texts.push(block.content.text_block.text);
            }
          }
          if (texts.length > 0) return doubaoDeltaOf(texts.join(''));
        }
        // 备选字段
        if (chunk.content && typeof chunk.content === 'string') return chunk.content;
        if (chunk.delta) return chunk.delta;
        return null;
      },

      detectStreamEnd: function(chunk) {
        if (!chunk) return null;
        if (chunk.event_type === 2003) {
          _doubaoLastLen = 0; // 流结束重置累积长度，供下一流 deltaOf 使用
          return 'finished';
        }
        if (chunk.is_finish === true) {
          _doubaoLastLen = 0;
          return 'finished';
        }
        return null;
      },

      detectEventClose: function(eventType, chunk) {
        if (eventType === 'SSE_REPLY_END') return 'reply_end';
        return null;
      },

      binaryStream: false,
      // 所有返回统一为增量，由拦截器拼接
      cumulativeContent: false
    },

    dom: {
      chatInputSelectors: [
        'textarea.semi-input-textarea',
        'textarea[placeholder*="发消息"]',
        'textarea[placeholder*="豆包"]',
        'textarea[placeholder*="发送"]',
        'textarea',
        'div[contenteditable="true"]',
        '[role="textbox"]'
      ],

      findSendButton: function() {
        // 豆包：发送按钮在 textarea 父级内
        // 特征：不含文字、含 SVG、class 含 bg-dbx-text-highlight、非 dropdown-menu-trigger
        var ta = document.querySelector('textarea.semi-input-textarea');
        if (ta) {
          var walk = ta.parentElement;
          for (var k = 0; k < 8; k++) {
            if (!walk) break;
            var btns = walk.querySelectorAll('button');
            for (var j = 0; j < btns.length; j++) {
              var b = btns[j];
              if (b.clientHeight === 0) continue;
              // 排除下拉菜单触发器
              if (b.getAttribute('data-slot') === 'dropdown-menu-trigger') continue;
              if (b.getAttribute('aria-haspopup')) continue;
              // 排除有文字的按钮（功能按钮如"编程"、"翻译"等）
              if (b.textContent.trim().length > 0) continue;
              // 发送按钮特征：含 SVG 且 class 含 highlight
              if (b.querySelector('svg')) {
                var cls = typeof b.className === 'string' ? b.className : '';
                if (cls.indexOf('highlight') >= 0) {
                  b.setAttribute('data-ds-send-btn', 'doubao-highlight');
                  return b;
                }
              }
            }
            walk = walk.parentElement;
          }
          // 备选：找仅含 SVG 且无文字无 aria-haspopup 的 button
          walk = ta.parentElement;
          for (var m = 0; m < 8; m++) {
            if (!walk) break;
            var btns2 = walk.querySelectorAll('button');
            for (var n = 0; n < btns2.length; n++) {
              var b2 = btns2[n];
              if (b2.clientHeight === 0) continue;
              if (b2.getAttribute('data-slot') === 'dropdown-menu-trigger') continue;
              if (b2.getAttribute('aria-haspopup')) continue;
              if (b2.textContent.trim().length > 0) continue;
              if (b2.querySelector('svg')) {
                b2.setAttribute('data-ds-send-btn', 'doubao-svg-fallback');
                return b2;
              }
            }
            walk = walk.parentElement;
          }
        }

        // 通用选择器
        var sendSelectors = [
          '[class*="send-button"]',
          '[class*="send-btn"]',
          'button[aria-label*="发送" i]',
          'button[aria-label*="send" i]',
          '[data-testid*="send"]'
        ];
        for (var s = 0; s < sendSelectors.length; s++) {
          var els = document.querySelectorAll(sendSelectors[s]);
          for (var i = 0; i < els.length; i++) {
            if (els[i].clientHeight > 0) return els[i];
          }
        }
        return null;
      },

      aiMessageSelectors: [
        'div[class*="assistant"]',
        'div[class*="markdown-body"]',
        'div[class*="message-content"]',
        'div[class*="markdown"]',
        'div[class*="answer"]',
        'div[class*="response"]'
      ],
      thinkContentSelector: '[class*="think-content"], [class*="thinking-content"]',
      userMessageSelector: '[class*="user-message"], [class*="human-message"]',

      isUserMessage: function(el) {
        return PlatformAdapter.isUserMessage(el);
      },

      detectStreaming: function() {
        var stopBtn = document.querySelector('button[aria-label*="stop" i], button[aria-label*="停止" i], [class*="stop"]');
        if (stopBtn && stopBtn.clientHeight > 0) return true;
        return false;
      }
    },

    setInputValue: function(element, value) {
      // 豆包使用 textarea (Semi Design)
      // 原生 setter 优先（execCommand('insertText') 对长文本静默失败）
      element.focus();
      try {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (setter && setter.set) setter.set.call(element, value);
        else element.value = value;
      } catch(e) { element.value = value; }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    },

    sendMessage: function() {
      var btn = this.dom.findSendButton();
      if (btn && !btn.disabled) { btn.click(); return true; }
      // fallback: Enter
      var input = typeof findChatInput === 'function' ? findChatInput() : null;
      return PlatformAdapter.sendMessageFallback(input);
    }
  };

  PlatformRegistry.register(doubaoAdapter);
})();

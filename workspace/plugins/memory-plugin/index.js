module.exports = function register(api) {
  var fss = require('fs');
  var path = require('path');

  api.logger.info('[memory-plugin] 初始化记忆引擎 v2.0.0 (pi 记忆系统)');

  // pi 记忆系统目录（WSL UNC 路径），可在服务端通过 DTA_PI_MEMORY_DIR 覆盖
  // 默认: //wsl$/Ubuntu/home/luoshenye/.pi/agent/memory
  var memDir = api.memoryDir || path.join(api.resolvePath(''), '..', 'memory');
  var dailyDir = path.join(memDir, 'daily');
  var notesDir = path.join(memDir, 'notes');
  var LAMBDA = 0.01;
  var MS_PER_DAY = 86400000;

  // 核心记忆文件（会话注入 / 摘要时优先读取）
  var CORE_FILES = [
    'MEMORY.md', 'USER.md', 'PROJECTS.md', 'PORTFOLIO.md',
    'HANDOFF.md', 'SCRATCHPAD.md', 'SOUL.md', 'TIMELINE.md',
    'self-distillation.md'
  ];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function nowParts(d) {
    d = d || new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate(), h: d.getHours(), min: d.getMinutes(), s: d.getSeconds() };
  }
  function dateStr(d) { var p = nowParts(d); return p.y + '-' + pad(p.m) + '-' + pad(p.day); }
  function timeStr(d) { var p = nowParts(d); return pad(p.h) + ':' + pad(p.min) + ':' + pad(p.s); }
  function shortDate(d) { var p = nowParts(d); return p.m + '/' + p.day; }

  function ensureDir() {
    if (!fss.existsSync(memDir)) fss.mkdirSync(memDir, { recursive: true });
    if (!fss.existsSync(dailyDir)) fss.mkdirSync(dailyDir, { recursive: true });
    if (!fss.existsSync(notesDir)) fss.mkdirSync(notesDir, { recursive: true });
  }

  function uid() {
    return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function shortHash() {
    return Math.random().toString(36).slice(2, 8);
  }

  // ═════════════════════════════════════════════════════════
  // 扫描与解析 pi 记忆目录
  // ═════════════════════════════════════════════════════════

  function scanMdFiles(dir, base) {
    var out = [];
    var entries;
    try { entries = fss.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i];
      var fp = path.join(dir, en.name);
      var rel = path.join(base || '', en.name);
      if (en.isDirectory()) {
        out = out.concat(scanMdFiles(fp, rel));
      } else if (/\.md$/i.test(en.name)) {
        try {
          var st = fss.statSync(fp);
          var content = fss.readFileSync(fp, 'utf-8');
          out.push({ file: fp, rel: rel, name: en.name, content: content, mtime: st.mtimeMs });
        } catch (e) {}
      }
    }
    return out;
  }

  // 将 Markdown 文件切分为记忆条目
  // daily 日志: <!-- 2026-08-19 10:30:50 [hash] --> \n ## M/D 标题 \n 内容
  // 核心文件: 按 ## 章节切分；无章节则整文件一条
  function parseEntries(f) {
    var out = [];
    var re = /<!--\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*\[([^\]]*)\]\s*-->\s*\n?([\s\S]*?)(?=<!--|\s*$)/g;
    var m, found = false;
    while ((m = re.exec(f.content)) !== null) {
      found = true;
      var ts = new Date(m[1].replace(' ', 'T'));
      var body = (m[3] || '').trim();
      if (!body) continue;
      out.push({
        id: m[2] || shortHash(),
        content: body,
        createdAt: isNaN(ts.getTime()) ? f.mtime : ts.getTime(),
        source: f.rel
      });
    }
    if (!found || out.length === 0) {
      var secRe = /^##\s+(.+)$/gm;
      var sm, sections = [];
      while ((sm = secRe.exec(f.content)) !== null) {
        sections.push({ title: sm[1], start: sm.index, titleEnd: sm.index + sm[0].length });
      }
      if (sections.length === 0) {
        if (f.content.trim()) {
          out.push({ id: uid(), content: f.content.trim(), createdAt: f.mtime, source: f.rel });
        }
      } else {
        for (var i = 0; i < sections.length; i++) {
          var start = sections[i].titleEnd;
          var end = i + 1 < sections.length ? sections[i + 1].start : f.content.length;
          var secBody = f.content.slice(start, end).trim();
          var secTitle = sections[i].title.trim();
          out.push({
            id: uid() + '_' + i,
            content: secTitle + (secBody ? '\n' + secBody : ''),
            createdAt: f.mtime,
            source: f.rel
          });
        }
      }
    }
    return out;
  }

  // 获取全部记忆条目（核心文件 + daily + notes）
  function getAllRecords() {
    var records = [];
    var files = scanMdFiles(memDir, '');
    for (var i = 0; i < files.length; i++) {
      var entries = parseEntries(files[i]);
      for (var j = 0; j < entries.length; j++) {
        entries[j].role = /daily|notes/.test(entries[j].source) ? 'note' : 'core';
        records.push(entries[j]);
      }
    }
    return records;
  }

  // 读取核心摘要文件（USER.md / MEMORY.md 等）返回截断内容
  function getCoreSummary(limitPerFile) {
    limitPerFile = limitPerFile || 4000;
    var parts = [];
    for (var i = 0; i < CORE_FILES.length; i++) {
      var fp = path.join(memDir, CORE_FILES[i]);
      try {
        if (fss.existsSync(fp)) {
          var content = fss.readFileSync(fp, 'utf-8');
          var safe = content.slice(0, limitPerFile);
          if (content.length > limitPerFile) safe += '\n...(截断)';
          parts.push({ name: CORE_FILES[i], content: safe, length: content.length });
        }
      } catch (e) {}
    }
    return parts;
  }

  // ═════════════════════════════════════════════════════════
  // 搜索算法（关键词 TF-IDF + 时间衰减 + RRF 融合）
  // ═════════════════════════════════════════════════════════

  function tokenize(text) {
    var tokens = [];
    var re = /[\u4e00-\u9fff\u3400-\u4dbf]+|[a-zA-Z0-9]+/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var t = m[0].toLowerCase();
      if (t.length >= 2) tokens.push(t);
    }
    return tokens;
  }

  function computeTF(tokens) {
    var tf = {};
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      tf[t] = (tf[t] || 0) + 1;
    }
    var total = tokens.length || 1;
    var keys = Object.keys(tf);
    for (var j = 0; j < keys.length; j++) {
      tf[keys[j]] = tf[keys[j]] / total;
    }
    return tf;
  }

  function computeIDF(allRecords, queryTokens) {
    var N = allRecords.length || 1;
    var df = {};
    for (var i = 0; i < allRecords.length; i++) {
      var seen = {};
      var rTokens = tokenize(allRecords[i].content || '');
      for (var j = 0; j < rTokens.length; j++) {
        var t = rTokens[j];
        if (!seen[t]) {
          seen[t] = true;
          df[t] = (df[t] || 0) + 1;
        }
      }
    }
    var idf = {};
    for (var k = 0; k < queryTokens.length; k++) {
      var t = queryTokens[k];
      var d = df[t] || 0;
      idf[t] = Math.log((N - d + 0.5) / (d + 0.5) + 1);
    }
    return idf;
  }

  function keywordSearch(query, records, topK) {
    topK = topK || 10;
    if (records.length === 0) return [];

    var queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    var idf = computeIDF(records, queryTokens);
    var now = Date.now();
    var scored = [];

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var rTokens = tokenize(r.content || '');
      var tf = computeTF(rTokens);

      var score = 0;
      for (var j = 0; j < queryTokens.length; j++) {
        var t = queryTokens[j];
        score += (tf[t] || 0) * (idf[t] || 0);
      }

      if (score > 0) {
        var daysOld = (now - r.createdAt) / MS_PER_DAY;
        scored.push({
          record: r,
          keywordScore: score,
          decayedScore: score * Math.exp(-LAMBDA * daysOld)
        });
      }
    }

    scored.sort(function (a, b) { return b.decayedScore - a.decayedScore; });
    return scored.slice(0, topK);
  }

  function recencySearch(records, topK) {
    topK = topK || 10;
    var now = Date.now();
    var scored = [];

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var daysOld = (now - r.createdAt) / MS_PER_DAY;
      scored.push({
        record: r,
        recencyScore: Math.exp(-LAMBDA * daysOld)
      });
    }

    scored.sort(function (a, b) { return b.recencyScore - a.recencyScore; });
    return scored.slice(0, topK);
  }

  function rrfFusion(kwResults, recResults, topK, rrfK) {
    topK = topK || 10;
    rrfK = rrfK || 60;
    var scores = {};
    var recordMap = {};

    for (var i = 0; i < kwResults.length; i++) {
      var key = kwResults[i].record.id;
      scores[key] = (scores[key] || 0) + 1 / (rrfK + i + 1);
      recordMap[key] = kwResults[i].record;
    }

    for (var j = 0; j < recResults.length; j++) {
      var key2 = recResults[j].record.id;
      scores[key2] = (scores[key2] || 0) + 1 / (rrfK + j + 1);
      recordMap[key2] = recResults[j].record;
    }

    var keys = Object.keys(scores);
    keys.sort(function (a, b) { return scores[b] - scores[a]; });

    var results = [];
    for (var k = 0; k < Math.min(topK, keys.length); k++) {
      results.push(recordMap[keys[k]]);
    }
    return results;
  }

  // ═════════════════════════════════════════════════════════
  // 记忆写入 — 按 pi daily 日志格式追加
  // ═════════════════════════════════════════════════════════
  function memorySaveToDaily(role, content, sessionId, title) {
    ensureDir();
    var now = new Date();
    var day = dateStr(now);
    var dailyFile = path.join(dailyDir, day + '.md');
    var t = title || content.split('\n')[0].slice(0, 30) || '记忆条目';
    var hash = shortHash();
    var roleMark = role === 'assistant' ? 'assistant: ' : (role === 'user' ? 'user: ' : '');
    var entry =
      '<!-- ' + day + ' ' + timeStr(now) + ' [' + hash + '] -->\n' +
      '## ' + shortDate(now) + ' ' + t + '\n' +
      '- ' + roleMark + content.replace(/\n/g, '\n  ') + '\n\n';

    var existing = '';
    try { existing = fss.existsSync(dailyFile) ? fss.readFileSync(dailyFile, 'utf-8') : ''; } catch (e) {}
    fss.writeFileSync(dailyFile, existing + entry, 'utf-8');
    return { id: hash, file: 'daily/' + day + '.md', createdAt: now.getTime() };
  }

  // ═════════════════════════════════════════════════════════
  // 工具注册
  // ═════════════════════════════════════════════════════════
  api.registerTool(function (ctx) {
    return [
      {
        name: 'memory_save',
        label: 'Save Memory',
        description: '保存对话记忆到 pi 记忆系统（追加到 daily/YYYY-MM-DD.md 日志）。参数: role(user/assistant), content(记忆内容), sessionId(可选, 会话标识), title(可选, 标题), provider(可选)',
        parameters: {
          type: 'object',
          properties: {
            role: { type: 'string', description: '角色: user 或 assistant' },
            content: { type: 'string', description: '要保存的记忆内容' },
            sessionId: { type: 'string', description: '会话标识(可选)' },
            title: { type: 'string', description: '日志标题(可选, 默认取内容首行)' },
            provider: { type: 'string', description: '来源标识(可选, 默认deepseek)' }
          },
          required: ['role', 'content']
        },
        execute: async function (toolCallId, args) {
          try {
            var saved = memorySaveToDaily(args.role, args.content, args.sessionId, args.title);
            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'memory_save',
              id: saved.id,
              file: saved.file,
              message: '已追加到 pi 记忆: ' + saved.file
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'memory_save',
              error: e.message
            }) }];
          }
        }
      },

      {
        name: 'memory_search',
        label: 'Search Memory',
        description: '在 pi 记忆系统(MEMORY.md/USER.md/daily/notes)中混合搜索：关键词 + 时间衰减 + RRF融合。参数: query(搜索关键词), topK(可选, 默认10)',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
            topK: { type: 'number', description: '返回结果数量(默认10)' }
          },
          required: ['query']
        },
        execute: async function (toolCallId, args) {
          try {
            var topK = args.topK || 10;
            var query = args.query || '';
            var records = getAllRecords();

            if (records.length === 0) {
              return [{ type: 'text', text: JSON.stringify({
                success: true,
                tool: 'memory_search',
                results: [],
                query: query,
                message: 'pi 记忆目录为空'
              }) }];
            }

            var kwResults = keywordSearch(query, records, Math.min(50, records.length));
            var recResults = recencySearch(records, Math.min(50, records.length));
            var merged = rrfFusion(kwResults, recResults, topK);

            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'memory_search',
              query: query,
              totalRecords: records.length,
              resultCount: merged.length,
              results: merged.map(function (r) {
                return {
                  id: r.id,
                  role: r.role,
                  content: r.content,
                  source: r.source,
                  createdAt: r.createdAt
                };
              })
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'memory_search',
              error: e.message
            }) }];
          }
        }
      },

      {
        name: 'memory_recall',
        label: 'Recall Memory',
        description: '回忆 pi 记忆：返回最近记忆 + 核心文件摘要。参数: limit(可选, 最近记忆条数, 默认10), includeCore(可选, 是否含核心文件摘要, 默认false)',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: '最近记忆条数(默认10)' },
            includeCore: { type: 'boolean', description: '是否包含核心文件摘要(USER.md/MEMORY.md, 默认false)' }
          },
          required: []
        },
        execute: async function (toolCallId, args) {
          try {
            var limit = args.limit || 10;
            var records = getAllRecords();

            records.sort(function (a, b) { return b.createdAt - a.createdAt; });
            var recent = records.slice(0, limit);

            var result = {
              success: true,
              tool: 'memory_recall',
              totalRecords: records.length,
              resultCount: recent.length,
              results: recent.map(function (r) {
                return {
                  id: r.id,
                  role: r.role,
                  content: r.content,
                  source: r.source,
                  createdAt: r.createdAt
                };
              })
            };

            if (args.includeCore) {
              result.core = getCoreSummary(3000);
            }

            return [{ type: 'text', text: JSON.stringify(result) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'memory_recall',
              error: e.message
            }) }];
          }
        }
      },

      {
        name: 'memory_forget',
        label: 'Forget Memory',
        description: '从 pi 记忆删除条目。参数: id(记忆条目ID) 或 sessionId(删除含此会话标识的条目)',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '要删除的记忆条目ID(来自 daily 时间戳注释的 hash)' },
            sessionId: { type: 'string', description: '要清除的会话标识' }
          },
          required: []
        },
        execute: async function (toolCallId, args) {
          try {
            if (!args.id && !args.sessionId) {
              return [{ type: 'text', text: JSON.stringify({ success: false, tool: 'memory_forget', error: '缺少 id 或 sessionId 参数' }) }];
            }

            var files = scanMdFiles(memDir, '');
            var deleted = 0;
            var matched = [];

            for (var i = 0; i < files.length; i++) {
              var f = files[i];
              var newContent = f.content;
              if (args.sessionId) {
                // 删除包含 sessionId 的整块条目
                var re = /<!--\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s*\[[^\]]*\]\s*-->\s*\n?([\s\S]*?)(?=<!--|\s*$)/g;
                var parts = [];
                var last = 0, m2;
                var removedInFile = 0;
                while ((m2 = re.exec(f.content)) !== null) {
                  var block = m2[0];
                  if (block.indexOf(args.sessionId) >= 0) {
                    removedInFile++;
                  } else {
                    parts.push(f.content.slice(last, m2.index));
                    last = m2.index + m2[0].length;
                  }
                }
                if (removedInFile > 0) {
                  parts.push(f.content.slice(last));
                  newContent = parts.join('');
                  deleted += removedInFile;
                }
              } else if (args.id) {
                var reId = new RegExp('<!--\\s*\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\s*\\[' + args.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]\\s*-->\\s*\\n?[\\s\\S]*?(?=<!--|\\s*$)');
                if (reId.test(f.content)) {
                  newContent = f.content.replace(reId, '');
                  deleted++;
                }
              }

              if (newContent !== f.content) {
                try { fss.writeFileSync(f.file, newContent.trim() + '\n', 'utf-8'); } catch (e) {}
                matched.push(f.rel);
              }
            }

            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'memory_forget',
              deleted: deleted,
              files: matched,
              message: deleted > 0 ? '已删除 ' + deleted + ' 条记忆' : '未找到匹配的记忆'
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'memory_forget',
              error: e.message
            }) }];
          }
        }
      },

      {
        name: 'memory_stats',
        label: 'Memory Stats',
        description: '获取 pi 记忆系统统计信息。参数: 无',
        parameters: { type: 'object', properties: {}, required: [] },
        execute: async function (toolCallId, args) {
          try {
            var records = getAllRecords();
            var files = scanMdFiles(memDir, '');
            var dailyCount = 0;
            var notesCount = 0;
            for (var i = 0; i < files.length; i++) {
              if (/daily/.test(files[i].rel)) dailyCount++;
              else if (/notes/.test(files[i].rel)) notesCount++;
            }

            var coreFiles = [];
            for (var j = 0; j < CORE_FILES.length; j++) {
              var fp = path.join(memDir, CORE_FILES[j]);
              try {
                if (fss.existsSync(fp)) {
                  coreFiles.push({ name: CORE_FILES[j], size: fss.statSync(fp).size });
                }
              } catch (e) {}
            }

            return [{ type: 'text', text: JSON.stringify({
              success: true,
              tool: 'memory_stats',
              totalRecords: records.length,
              fileCount: files.length,
              dailyLogs: dailyCount,
              notes: notesCount,
              coreFiles: coreFiles,
              storageDir: memDir
            }) }];
          } catch (e) {
            return [{ type: 'text', text: JSON.stringify({
              success: false,
              tool: 'memory_stats',
              error: e.message
            }) }];
          }
        }
      }
    ];
  });

  api.logger.info('[memory-plugin] 已注册 5 个 pi 记忆工具: memory_save, memory_search, memory_recall, memory_forget, memory_stats');
  api.logger.info('[memory-plugin] 记忆目录: ' + memDir);
};

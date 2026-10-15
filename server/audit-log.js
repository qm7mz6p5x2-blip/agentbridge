const fs = require("fs").promises;
const path = require("path");

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const SENSITIVE_KEY_RE = /(api[_-]?key|token|secret|password|passwd|cookie|authorization)/i;

function sanitizeValue(value, key, depth) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[max-depth]";

  if (key && SENSITIVE_KEY_RE.test(key)) return "[REDACTED]";
  if (key === "content") return { type: "text", length: String(value).length };

  if (typeof value === "string") {
    const limit = key === "command" ? 300 : 500;
    return value.length > limit ? value.slice(0, limit) + "..." : value;
  }

  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, "", depth + 1));
  }

  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    output[childKey] = sanitizeValue(childValue, childKey, depth + 1);
  }
  return output;
}

function sanitizeArgs(args) {
  return sanitizeValue(args || {}, "", 0);
}

class AuditLog {
  constructor(workspaceDir, options = {}) {
    this.dir = path.join(workspaceDir, "audit");
    this.file = path.join(this.dir, "tool-audit.jsonl");
    this.maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
    this._queue = Promise.resolve();
  }

  async append(entry) {
    const record = {
      timestamp: new Date().toISOString(),
      tool: entry.tool || "unknown",
      mode: entry.mode || "auto",
      success: entry.success !== false,
      durationMs: Number(entry.durationMs || 0),
      error: entry.error ? String(entry.error).slice(0, 1000) : "",
      args: sanitizeArgs(entry.args || {}),
    };

    this._queue = this._queue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await this._rotateIfNeeded();
      await fs.appendFile(this.file, JSON.stringify(record) + "\n", "utf-8");
    }).catch(() => {});

    return this._queue;
  }

  async list(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit) || 100, 1000));
    let records = [];

    try {
      const raw = await fs.readFile(this.file, "utf-8");
      records = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try { return JSON.parse(line); } catch (e) { return null; }
        })
        .filter(Boolean);
    } catch (e) {
      return [];
    }

    if (options.tool) {
      records = records.filter((item) => item.tool === options.tool);
    }
    if (typeof options.success === "boolean") {
      records = records.filter((item) => item.success === options.success);
    }

    return records.slice(-limit).reverse();
  }

  async stats() {
    const records = await this.list({ limit: 1000 });
    const byTool = {};
    let success = 0;
    let failure = 0;
    let totalDuration = 0;

    for (const record of records) {
      if (record.success) success++;
      else failure++;
      totalDuration += Number(record.durationMs || 0);
      byTool[record.tool] = (byTool[record.tool] || 0) + 1;
    }

    return {
      total: records.length,
      success,
      failure,
      averageDurationMs: records.length ? Math.round(totalDuration / records.length) : 0,
      byTool,
      lastUsedAt: records[0] ? records[0].timestamp : null,
    };
  }

  async clear() {
    this._queue = this._queue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(this.file, "", "utf-8");
    }).catch(() => {});
    await this._queue;
    return { success: true };
  }

  async _rotateIfNeeded() {
    try {
      const stat = await fs.stat(this.file);
      if (stat.size < this.maxBytes) return;
      await fs.rename(this.file, this.file + ".1");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}

function createAuditLog(workspaceDir, options) {
  return new AuditLog(workspaceDir, options);
}

module.exports = {
  AuditLog,
  createAuditLog,
  sanitizeArgs,
};

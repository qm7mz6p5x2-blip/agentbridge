const crypto = require("crypto");
const fs = require("fs").promises;
const path = require("path");

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 200;

class ApprovalQueue {
  constructor(workspaceDir, options = {}) {
    this.dir = path.join(workspaceDir, "approvals");
    this.file = path.join(this.dir, "approvals.json");
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.entries = [];
    this._queue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.file, "utf-8");
      const parsed = JSON.parse(raw);
      this.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (e) {
      this.entries = [];
    }
    this.cleanup();
    return this.entries;
  }

  async create(request) {
    const entry = {
      id: "approval_" + crypto.randomBytes(8).toString("hex"),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
      status: "pending",
      tool: request.tool,
      args: request.args || {},
      mode: request.mode || "manual",
      toolCallId: request.toolCallId || "",
      reason: request.reason || "此工具需要用户确认",
      resolvedAt: "",
      resolution: "",
    };
    this.entries.push(entry);
    this.cleanup();
    await this.save();
    return entry;
  }

  async list(options = {}) {
    this.cleanup();
    const limit = Math.max(1, Math.min(Number(options.limit) || 100, 500));
    let entries = this.entries.slice();
    if (options.status) {
      entries = entries.filter((entry) => entry.status === options.status);
    }
    return entries
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  async get(id) {
    this.cleanup();
    return this.entries.find((entry) => entry.id === id) || null;
  }

  async approve(id, options = {}) {
    const entry = await this.get(id);
    if (!entry) throw new Error("审批请求不存在");
    if (entry.status !== "pending") throw new Error("审批请求已处理");
    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      entry.status = "expired";
      await this.save();
      throw new Error("审批请求已过期");
    }
    entry.status = "approved";
    entry.resolvedAt = new Date().toISOString();
    entry.resolution = options.remember ? "approved_always" : "approved_once";
    await this.save();
    return entry;
  }

  async deny(id, reason) {
    const entry = await this.get(id);
    if (!entry) throw new Error("审批请求不存在");
    if (entry.status !== "pending") throw new Error("审批请求已处理");
    entry.status = "denied";
    entry.resolvedAt = new Date().toISOString();
    entry.resolution = reason || "denied";
    await this.save();
    return entry;
  }

  async stats() {
    this.cleanup();
    const stats = { pending: 0, approved: 0, denied: 0, expired: 0, total: this.entries.length };
    for (const entry of this.entries) {
      if (stats[entry.status] !== undefined) stats[entry.status]++;
    }
    return stats;
  }

  async clear() {
    this.entries = [];
    await this.save();
    return { success: true };
  }

  cleanup() {
    const now = Date.now();
    for (const entry of this.entries) {
      if (entry.status === "pending" && new Date(entry.expiresAt).getTime() < now) {
        entry.status = "expired";
        entry.resolvedAt = new Date().toISOString();
        entry.resolution = "expired";
      }
    }
    this.entries = this.entries
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, this.maxEntries);
  }

  async save() {
    this._queue = this._queue.then(async () => {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(this.file, JSON.stringify({ entries: this.entries }, null, 2) + "\n", "utf-8");
    });
    return this._queue;
  }
}

function createApprovalQueue(workspaceDir, options) {
  return new ApprovalQueue(workspaceDir, options);
}

module.exports = {
  ApprovalQueue,
  createApprovalQueue,
};

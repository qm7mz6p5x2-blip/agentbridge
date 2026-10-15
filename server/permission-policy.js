const fs = require("fs").promises;
const path = require("path");

const VALID_MODES = new Set(["off", "manual", "auto"]);

const DEFAULT_CONFIG = {
  enforce: true,
  defaultMode: "auto",
  tools: {
    write_file: "manual",
    append_file: "manual",
    plugin_install: "manual",
    plugin_install_url: "manual",
    plugin_uninstall: "manual",
  },
};

function normalizeMode(mode) {
  return VALID_MODES.has(mode) ? mode : null;
}

class PermissionPolicy {
  constructor(filePath, initialConfig) {
    this.filePath = filePath;
    this.config = {
      ...DEFAULT_CONFIG,
      ...(initialConfig || {}),
      tools: {
        ...DEFAULT_CONFIG.tools,
        ...((initialConfig && initialConfig.tools) || {}),
      },
    };
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const loaded = JSON.parse(raw);
      this.config = {
        enforce: loaded.enforce !== false,
        defaultMode: normalizeMode(loaded.defaultMode) || "auto",
        tools: {},
      };
      for (const [toolName, mode] of Object.entries(loaded.tools || {})) {
        const normalized = normalizeMode(mode);
        if (normalized) this.config.tools[toolName] = normalized;
      }
    } catch (e) {
      await this.save();
    }
    return this.config;
  }

  evaluate(toolName, requestedMode, options = {}) {
    if (!this.config.enforce) {
      return { allowed: true, mode: "auto", needsConfirmation: false, reason: "" };
    }

    const requested = normalizeMode(requestedMode);
    if (requested === "off") {
      return { allowed: false, mode: "off", needsConfirmation: false, reason: "工具已被 OFF 模式禁用" };
    }

    const configured = this.config.tools[toolName] || this.config.defaultMode;
    if (configured === "off") {
      return { allowed: false, mode: "off", needsConfirmation: false, reason: "工具策略禁止执行" };
    }
    const mode = requested === "manual" ? "manual" : configured;
    if (mode === "manual" && options.confirmed !== true) {
      return { allowed: false, mode, needsConfirmation: true, reason: "此工具需要用户确认" };
    }
    return { allowed: true, mode, needsConfirmation: false, reason: "" };
  }

  async setToolMode(toolName, mode) {
    const normalized = normalizeMode(mode);
    if (!toolName || !normalized) {
      throw new Error("无效的工具名或权限模式");
    }
    this.config.tools[toolName] = normalized;
    await this.save();
    return this.config.tools[toolName];
  }

  async setDefaultMode(mode) {
    const normalized = normalizeMode(mode);
    if (!normalized) throw new Error("无效的默认权限模式");
    this.config.defaultMode = normalized;
    await this.save();
    return this.config.defaultMode;
  }

  async setEnforce(enabled) {
    this.config.enforce = enabled !== false;
    await this.save();
    return this.config.enforce;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.config, null, 2) + "\n", "utf-8");
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.config));
  }
}

function createPermissionPolicy(filePath, initialConfig) {
  return new PermissionPolicy(filePath, initialConfig);
}

module.exports = {
  DEFAULT_CONFIG,
  PermissionPolicy,
  createPermissionPolicy,
  normalizeMode,
};

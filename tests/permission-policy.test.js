const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

const {
  createPermissionPolicy,
  normalizeMode,
} = require("../server/permission-policy.js");

test("uses safe defaults for write operations", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-policy-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const policy = createPermissionPolicy(path.join(dir, "permissions.json"));
  await policy.load();

  const writeDecision = policy.evaluate("write_file", "auto");
  assert.equal(writeDecision.allowed, false);
  assert.equal(writeDecision.needsConfirmation, true);

  const confirmed = policy.evaluate("write_file", "auto", { confirmed: true });
  assert.equal(confirmed.allowed, true);
  assert.equal(confirmed.mode, "manual");

  const readDecision = policy.evaluate("read_file", "auto");
  assert.equal(readDecision.allowed, true);
  assert.equal(readDecision.mode, "auto");
});

test("persists tool mode changes", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-policy-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const file = path.join(dir, "permissions.json");
  const policy = createPermissionPolicy(file);
  await policy.load();
  await policy.setToolMode("read_file", "off");

  const reloaded = createPermissionPolicy(file);
  await reloaded.load();
  assert.equal(reloaded.evaluate("read_file", "auto").allowed, false);
  assert.equal(reloaded.evaluate("read_file", "manual").allowed, false);
  assert.equal(normalizeMode("invalid"), null);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

const { createApprovalQueue } = require("../server/approval-queue.js");

test("creates and approves a pending tool request", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-approval-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const queue = createApprovalQueue(workspace);
  await queue.load();
  const pending = await queue.create({
    tool: "write_file",
    args: { path: "sample.txt", content: "hello" },
    mode: "manual",
  });

  assert.equal((await queue.list({ status: "pending" })).length, 1);
  const approved = await queue.approve(pending.id, { remember: true });
  assert.equal(approved.status, "approved");
  assert.equal(approved.resolution, "approved_always");
  assert.equal((await queue.list({ status: "pending" })).length, 0);
  await queue.clear();
  assert.equal((await queue.list()).length, 0);
});

test("denies a pending request and persists the result", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-approval-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const queue = createApprovalQueue(workspace);
  await queue.load();
  const pending = await queue.create({ tool: "exec_command", args: { command: "echo test" } });
  await queue.deny(pending.id, "not allowed");

  const reloaded = createApprovalQueue(workspace);
  await reloaded.load();
  const entry = await reloaded.get(pending.id);
  assert.equal(entry.status, "denied");
  assert.equal(entry.resolution, "not allowed");
});

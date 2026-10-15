const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

const { createAuditLog } = require("../server/audit-log.js");

test("records, filters, and summarizes tool executions", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-audit-"));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const log = createAuditLog(workspace);
  await log.append({
    tool: "read_file",
    args: { path: "README.md", token: "should-not-be-stored" },
    success: true,
    durationMs: 12,
  });
  await log.append({
    tool: "write_file",
    args: { path: "test.txt", content: "full content should not be stored" },
    success: false,
    durationMs: 8,
    error: "permission denied",
  });

  const entries = await log.list();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].tool, "write_file");
  assert.deepEqual(entries[0].args.content, {
    type: "text",
    length: 33,
  });
  assert.equal(entries[1].args.token, "[REDACTED]");

  const stats = await log.stats();
  assert.equal(stats.total, 2);
  assert.equal(stats.success, 1);
  assert.equal(stats.failure, 1);
  assert.equal(stats.averageDurationMs, 10);
});

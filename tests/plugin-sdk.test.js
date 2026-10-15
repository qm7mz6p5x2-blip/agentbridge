const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

const {
  createPlugin,
  toToolName,
} = require("../sdk/create-plugin.js");

test("scaffolds a plugin that registers one tool", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentbridge-plugin-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const result = await createPlugin({
    id: "sample-plugin",
    name: "Sample Plugin",
    toolName: "sample_hello",
    pluginsDir: dir,
  });

  assert.equal(result.toolName, "sample_hello");
  const manifest = JSON.parse(
    await fs.readFile(path.join(result.pluginDir, "plugin.json"), "utf-8")
  );
  assert.equal(manifest.id, "sample-plugin");

  const register = require(path.join(result.pluginDir, "index.js"));
  const registered = [];
  register({
    logger: { info() {} },
    registerTool(factory) {
      registered.push(...factory({}));
    },
  });

  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, "sample_hello");
  assert.equal(toToolName("Sample Hello!"), "sample_hello");
});

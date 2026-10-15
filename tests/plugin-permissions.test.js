const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const {
  createPluginSandbox,
  normalizePluginPermissions,
} = require("../server/plugin-loader.js");

const pluginDir = path.resolve(__dirname, "..", "workspace", "plugins", "example-plugin");
const workspaceDir = path.resolve(__dirname, "..", "workspace");

test("normalizes plugin permissions conservatively", () => {
  assert.deepEqual(normalizePluginPermissions(), {
    filesystem: true,
    network: false,
    child_process: false,
  });
  assert.deepEqual(normalizePluginPermissions({
    filesystem: false,
    network: true,
    child_process: true,
  }), {
    filesystem: false,
    network: true,
    child_process: true,
  });
});

test("blocks modules that the plugin did not declare", () => {
  const sandbox = createPluginSandbox(
    pluginDir,
    "example-plugin",
    workspaceDir,
    [],
    { filesystem: true, network: false, child_process: false }
  );

  assert.equal(typeof sandbox("fs").readFileSync, "function");
  assert.throws(() => sandbox("http"), /network 权限/);
  assert.throws(() => sandbox("child_process"), /child_process 权限/);
});

test("blocks filesystem when the plugin disables it", () => {
  const sandbox = createPluginSandbox(
    pluginDir,
    "no-fs-plugin",
    workspaceDir,
    [],
    { filesystem: false, network: false, child_process: false }
  );

  assert.throws(() => sandbox("fs"), /filesystem 权限/);
});

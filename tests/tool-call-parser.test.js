const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseToolCalls,
} = require("../src/core/tool-call-parser.js");

test("parses the standard tool_call format", () => {
  const calls = parseToolCalls(
    '<tool_call name="list_dir">{"path":"D:\\\\workspace\\\\config"}</tool_call>'
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "list_dir");
  assert.deepEqual(calls[0].arguments, {
    path: "D:\\workspace\\config",
  });
});

test("parses HTML-escaped tool_call tags", () => {
  const calls = parseToolCalls(
    "&lt;tool_call name=&quot;read_file&quot;&gt;{&quot;path&quot;:&quot;README.md&quot;}&lt;/tool_call&gt;"
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "read_file");
  assert.deepEqual(calls[0].arguments, {
    path: "README.md",
  });
});

test("repairs a missing closing angle bracket", () => {
  const calls = parseToolCalls(
    '<tool_call name="get_file_info">{"path":"package.json"}</tool_call'
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_file_info");
  assert.deepEqual(calls[0].arguments, {
    path: "package.json",
  });
});

test("deduplicates identical calls", () => {
  const calls = parseToolCalls(
    '<tool_call name="list_dir">{"path":"."}</tool_call>' +
      '<tool_call name="list_dir">{"path":"."}</tool_call>'
  );

  assert.equal(calls.length, 1);
});

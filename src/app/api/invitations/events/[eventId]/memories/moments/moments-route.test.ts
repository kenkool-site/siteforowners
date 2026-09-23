import assert from "node:assert/strict";
import test from "node:test";

test("moments route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
  assert.equal(typeof mod.POST, "function");
});

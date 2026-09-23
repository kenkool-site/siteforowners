import assert from "node:assert/strict";
import test from "node:test";

test("authenticated host media route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

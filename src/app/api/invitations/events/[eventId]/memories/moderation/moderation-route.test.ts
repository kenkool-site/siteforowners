import assert from "node:assert/strict";
import test from "node:test";

test("host moderation route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.PATCH, "function");
});

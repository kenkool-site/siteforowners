import { test } from "node:test";
import assert from "node:assert/strict";

test("session route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

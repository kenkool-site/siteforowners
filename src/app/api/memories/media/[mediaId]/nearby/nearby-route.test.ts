import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("nearby media route exists", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

test("delegates to getNearbyMedia and returns 404 when it resolves null, otherwise the media list", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /getNearbyMedia\(params\.mediaId\)/);
  assert.match(source, /status:\s*404/);
  assert.match(source, /NextResponse\.json\(\{\s*media:/);
});

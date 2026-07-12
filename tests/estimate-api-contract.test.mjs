import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("estimate API resolves tenant by Host and never reads tenant_id from form", async () => {
  const source = await readFile("src/app/api/estimate/route.ts", "utf8");
  assert.match(source, /resolveTenantByHost/);
  assert.match(source, /getClientIp/);
  assert.match(source, /checkRateLimit/);
  assert.doesNotMatch(source, /formData\.get\(["']tenant_id["']\)/);
  assert.match(source, /notification_state:\s*["']pending["']/);
});

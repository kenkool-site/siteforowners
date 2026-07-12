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

test("estimate API fans out to tenant-owned text and email destinations", async () => {
  const route = await readFile("src/app/api/estimate/route.ts", "utf8");
  const tenantResolver = await readFile("src/lib/admin-auth.ts", "utf8");
  assert.match(tenantResolver, /preview_slug, email, admin_email/);
  assert.match(route, /selectEstimateOwnerEmail\(tenant\)/);
  assert.match(route, /sendEstimateNotification/);
  assert.match(route, /sendEstimateEmail/);
  assert.match(route, /Promise\.all/);
  assert.doesNotMatch(route, /form(?:Data)?\.get\(["'](?:owner_)?email["']\)/);
  assert.match(route, /!textNotification\?\.destination_e164 && !ownerEmail/);
  assert.match(route, /text_notification_state:\s*textNotification\s*\?\s*["']pending["']\s*:\s*["']not_configured["']/);
  assert.match(route, /email_notification_state:\s*ownerEmail\s*\?\s*["']pending["']\s*:\s*["']not_configured["']/);
  assert.match(route, /estimateDeliveryUpdate\(textResult, emailResult\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, photoWarning \}\)/);
});

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
  const orchestration = await readFile("src/lib/estimate-delivery-orchestration.ts", "utf8");
  const tenantResolver = await readFile("src/lib/admin-auth.ts", "utf8");
  assert.match(tenantResolver, /preview_slug, email, admin_email/);
  assert.match(route, /selectEstimateOwnerEmail\(tenant\)/);
  assert.match(route, /sendEstimateNotification/);
  assert.match(route, /sendEstimateEmail/);
  assert.match(orchestration, /Promise\.all/);
  assert.match(route, /orchestrateEstimateDelivery\(\{/);
  assert.doesNotMatch(route, /form(?:Data)?\.get\(["'](?:owner_)?email["']\)/);
  assert.match(route, /!textNotification\?\.destination_e164 && !ownerEmail/);
  assert.match(route, /text_notification_state:\s*textNotification\s*\?\s*["']pending["']\s*:\s*["']not_configured["']/);
  assert.match(route, /email_notification_state:\s*ownerEmail\s*\?\s*["']pending["']\s*:\s*["']not_configured["']/);
  assert.match(orchestration, /estimateDeliveryUpdate\(text, email\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, photoWarning \}\)/);
});

test("Host tenant lookup protects both custom-domain and subdomain branches", async () => {
  const source = await readFile("src/lib/admin-auth.ts", "utf8");
  const select = "id, business_name, owner_name, phone, preview_slug, email, admin_email, admin_pin_hash, subscription_status, site_published, booking_tool, checkout_mode, booking_mode";
  const occurrences = source.split(select).length - 1;
  assert.equal(occurrences, 2, "both Host lookup branches must select owner email fields");
  assert.match(source, /\.eq\(["']custom_domain["'], normalized\)[\s\S]*if \(byCustom\.data\)[\s\S]*\.eq\(["']subdomain["'], subdomain\)/);
});

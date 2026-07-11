import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("estimate admin list requires founder auth and tenantId query", async () => {
  const source = await readFile(
    "src/app/api/admin/estimate-requests/list/route.ts",
    "utf8",
  );
  assert.match(source, /function requireFounder/);
  assert.match(source, /admin_session/);
  assert.match(source, /ADMIN_PASSWORD/);
  assert.match(source, /searchParams\.get\(["']tenantId["']\)/);
  assert.match(source, /\.eq\(["']tenant_id["'],\s*tenantId\)/);
  assert.match(source, /\.limit\(20\)/);
  assert.doesNotMatch(source, /createSignedUrl/);
});

test("estimate admin resend requires founder auth and tenant-scoped lookup", async () => {
  const source = await readFile(
    "src/app/api/admin/estimate-requests/resend/route.ts",
    "utf8",
  );
  assert.match(source, /function requireFounder/);
  assert.match(source, /admin_session/);
  assert.match(source, /\.eq\(["']id["'],\s*requestId\)/);
  assert.match(source, /\.eq\(["']tenant_id["'],\s*tenantId\)/);
  assert.match(source, /createEstimatePhotoLinks/);
  assert.match(source, /sendEstimateNotification/);
  assert.match(source, /status:\s*404/);
});

test("estimate delivery diagnostics is founder-only internal UI", async () => {
  const editorSource = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx",
    "utf8",
  );
  const diagnosticsSource = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/EstimateDeliveryDiagnostics.tsx",
    "utf8",
  );
  assert.match(editorSource, /EstimateDeliveryDiagnostics/);
  assert.match(editorSource, /NotificationSettingsSection/);
  assert.match(diagnosticsSource, /\/api\/admin\/estimate-requests\/list/);
  assert.match(diagnosticsSource, /\/api\/admin\/estimate-requests\/resend/);
  assert.match(diagnosticsSource, /Resend/);
});

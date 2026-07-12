import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview wizard exposes home_services business type", async () => {
  const source = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");
  assert.match(source, /value:\s*["']home_services["']/);
  assert.match(source, /isHomeServicesBusinessType/);
  assert.match(source, /HOME_SERVICES_WIZARD_VARIANTS/);
});

test("generate-copy seeds home_services_config for home_services previews", async () => {
  const source = await readFile("src/app/api/generate-copy/route.ts", "utf8");
  assert.match(source, /business_type === ["']home_services["']/);
  assert.match(source, /buildHomeServicesConfigForPreview/);
  assert.match(source, /home_services_config:/);
  assert.match(source, /address:\s*null/);
});

test("marketing lead maps outdoor services into wizard prefill", async () => {
  const { buildWizardPrefillUrl } = await import("../src/lib/marketing-lead.ts");
  const url = buildWizardPrefillUrl({
    id: "lead-1",
    business_name: "Green Lawn Co",
    business_type: "Outdoor / home services",
    phone: "555-0100",
  });
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  assert.equal(qs.get("type"), "home_services");
});

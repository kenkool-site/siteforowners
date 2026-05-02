import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("marketing page uses request-site CTAs instead of customer preview creation", async () => {
  const page = await readFile("src/app/(marketing)/page.tsx", "utf8");
  assert.match(page, /RequestSiteForm/, "marketing page should render the request-site form");

  const files = [
    "src/app/(marketing)/_components/Hero.tsx",
    "src/app/(marketing)/_components/Pricing.tsx",
    "src/app/(marketing)/_components/FinalCTA.tsx",
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /request-site/, `${file} should point customers to the request form`);
  }

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.equal(
      source.includes('href="/preview"'),
      false,
      `${file} should not send customers to the preview creator`,
    );
  }
});

test("request-site form collects required business lead fields", async () => {
  const path = "src/app/(marketing)/_components/RequestSiteForm.tsx";
  await access(path);
  const source = await readFile(path, "utf8");

  for (const field of ["businessName", "email", "phone", "businessAddress", "businessType"]) {
    assert.match(source, new RegExp(field), `form should include ${field}`);
  }

  for (const type of ["Braids", "Locs", "Haircuts", "Nails", "Salon"]) {
    assert.match(source, new RegExp(type), `form should include ${type} as a business type`);
  }

  assert.match(source, /\/api\/marketing-leads/, "form should submit to marketing leads API");
});

test("marketing leads API emails ADMIN_EMAIL", async () => {
  const path = "src/app/api/marketing-leads/route.ts";
  await access(path);
  const source = await readFile(path, "utf8");

  assert.match(source, /ADMIN_EMAIL/, "route should send lead email to ADMIN_EMAIL");
  assert.match(source, /businessName/, "route should validate business name");
  assert.match(source, /businessType/, "route should validate business type");
});

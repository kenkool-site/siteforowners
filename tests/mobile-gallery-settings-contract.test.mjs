import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  photosPage: "src/app/site/[slug]/admin/photos/page.tsx",
  photosClient: "src/app/site/[slug]/admin/photos/PhotosClient.tsx",
  imagesRoute: "src/app/api/admin/images/route.ts",
  siteEditor: "src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx",
};

test("owner Photos loads and saves the shared mobile gallery setting", async () => {
  const page = await readFile(files.photosPage, "utf8");
  const client = await readFile(files.photosClient, "utf8");

  assert.match(page, /mobile_gallery_slider/, "Photos page should load the setting");
  assert.match(
    page,
    /initialMobileGallerySlider/,
    "Photos page should pass the setting to its client",
  );
  assert.match(
    client,
    /Mobile gallery slider/,
    "Photos should expose a plainly named owner toggle",
  );
  assert.match(
    client,
    /mobileGallerySlider/,
    "Photos should track the toggle in local state",
  );
  assert.match(
    client,
    /mobile_gallery_slider:\s*snapshotToSave\.mobileGallerySlider/,
    "Photos should include the preference in its save request",
  );
});

test("owner images API validates and preserves the mobile gallery setting", async () => {
  const route = await readFile(files.imagesRoute, "utf8");

  assert.match(route, /mobile_gallery_slider/, "Images API should expose the setting");
  assert.match(
    route,
    /typeof rawMobileGallerySlider !== "boolean"/,
    "Images API should reject non-boolean supplied values",
  );
  assert.match(
    route,
    /settings\.mobile_gallery_slider = mobileGallerySlider/,
    "Images API should update the nested setting",
  );
  assert.match(
    route,
    /const nextCopy = \{ \.\.\.copy, section_settings: settings \}/,
    "Images API should preserve sibling generated copy and section settings",
  );
  assert.match(
    route,
    /const \{ data: existing, error: copyLoadError \} = await supabase/,
    "Images API should capture generated_copy load errors",
  );
  assert.match(
    route,
    /if \(copyLoadError\)/,
    "Images API should check generated_copy load errors",
  );
  assert.ok(
    route.indexOf("if (copyLoadError)") < route.indexOf("const nextCopy"),
    "Images API should check generated_copy load errors before rebuilding generated_copy",
  );
});

test("founder SiteEditor edits the same mobile gallery setting", async () => {
  const editor = await readFile(files.siteEditor, "utf8");

  assert.match(
    editor,
    /mobile_gallery_slider:\s*existingSettings\.mobile_gallery_slider === true/,
    "SiteEditor should default missing values to the grid",
  );
  assert.match(
    editor,
    /Mobile gallery slider/,
    "SiteEditor should expose the shared setting",
  );
  assert.match(
    editor,
    /toggleSection\("mobile_gallery_slider"\)/,
    "SiteEditor should update the shared section settings object",
  );
});

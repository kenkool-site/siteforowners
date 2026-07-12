import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home-services editor excludes stylist operational controls", async () => {
  const source = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /DepositEditor|BookingHoursEditor|booking provider|Acuity|Booksy/i);
  assert.match(source, /English/);
  assert.match(source, /Español/);
  assert.match(source, /HomeServicesConfig/);
});

test("focused home-services content editor exposes bilingual section, process, and area controls", async () => {
  const source = await readFile("src/app/(admin)/clients/[tenantId]/edit/HomeServicesContentEditor.tsx", "utf8");
  for (const token of ["section_copy", "process_steps", "service_areas", "parseZipInput", "show_process", "Up", "Down", "min-h-11", "rowErrors"]) assert.match(source, new RegExp(token));
  assert.match(source, /crypto\.randomUUID/);
});

test("ZIP input captures the DOM value before the deferred state updater runs", async () => {
  const source = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/HomeServicesContentEditor.tsx",
    "utf8",
  );
  assert.match(source, /const zipDraftValue = event\.currentTarget\.value/);
  assert.doesNotMatch(
    source,
    /setZipDrafts\(\(current\)[\s\S]{0,180}event\.currentTarget\.value/,
  );
});

test("home-services save validates before fetch and server validates only touched config after merge", async () => {
  const editor = await readFile("src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx", "utf8");
  assert.match(editor, /validateHomeServicesEditorConfig/);
  assert.ok(editor.indexOf("validateHomeServicesEditorConfig") < editor.indexOf('fetch("/api/update-site"'));
  assert.match(editor, /HomeServicesContentEditor/);
  const route = await readFile("src/app/api/update-site/route.ts", "utf8");
  assert.match(route, /generatedCopyUpdates\.home_services_config !== undefined/);
  assert.match(route, /validateHomeServicesConfigUpdate/);
  assert.match(route, /mergeGeneratedCopy/);
});

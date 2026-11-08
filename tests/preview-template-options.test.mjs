import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview creation exposes Runway as a selectable template", async () => {
  const source = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");

  assert.match(source, /id:\s*"runway"/, "preview wizard should include Runway in template options");
  assert.match(source, /name:\s*"Runway"/, "preview wizard should label the Runway option clearly");
});

test("preview creation exposes Maison as a selectable template", async () => {
  const wizard = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");
  const editor = await readFile("src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx", "utf8");
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");

  assert.match(wizard, /id:\s*"maison"/);
  assert.match(wizard, /name:\s*"Maison"/);
  assert.match(editor, /<option value="maison">Maison<\/option>/);
  assert.match(orchestrator, /case "maison":/);
});

test("preview generation APIs accept Runway templates", async () => {
  const generateRoute = await readFile("src/app/api/generate-copy/route.ts", "utf8");
  const regenerateRoute = await readFile("src/app/api/regenerate-copy/route.ts", "utf8");

  for (const [name, source] of [
    ["generate-copy", generateRoute],
    ["regenerate-copy", regenerateRoute],
  ]) {
    assert.match(source, /ALL_TEMPLATES[\s\S]*runway/, `${name} should allow Runway previews`);
  }
});

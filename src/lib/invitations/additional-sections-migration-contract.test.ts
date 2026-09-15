import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/052_invitation_additional_sections.sql", import.meta.url);

test("additional sections migration defaults existing invitations and caps stored sections", () => {
  assert.equal(existsSync(migrationUrl), true, "additional sections migration must exist");
  if (!existsSync(migrationUrl)) return;
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS additional_sections jsonb NOT NULL DEFAULT/);
  assert.match(migration, /jsonb_typeof\(additional_sections\) = 'array'/);
  assert.match(migration, /jsonb_array_length\(additional_sections\) <= 8/);
});

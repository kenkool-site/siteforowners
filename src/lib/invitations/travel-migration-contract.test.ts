import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/048_invitation_travel_info.sql", import.meta.url);

test("travel migration defaults existing invitations to empty optional lists and caps stored arrays", () => {
  assert.equal(existsSync(migrationUrl), true, "travel migration must exist");
  if (!existsSync(migrationUrl)) return;
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS travel_info jsonb NOT NULL DEFAULT/);
  assert.match(migration, /jsonb_array_length\(travel_info->'airports'\) <= 3/);
  assert.match(migration, /jsonb_array_length\(travel_info->'hotels'\) <= 5/);
});

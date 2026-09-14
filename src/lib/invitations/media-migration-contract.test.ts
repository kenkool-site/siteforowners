import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/039_invitation_media_atomic.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("gallery insertion locks the event before checking the hard cap and inserting", () => {
  const lock = migration.indexOf("FOR UPDATE");
  const count = migration.indexOf("COUNT(*)");
  const insert = migration.indexOf("INSERT INTO public.invitation_media");
  assert.ok(lock >= 0 && count > lock && insert > count);
  assert.match(migration, /IF v_gallery_count >= 12 THEN RAISE EXCEPTION 'invitation_gallery_full'/);
});

test("gallery insertion allocates after the maximum sort order so gaps cannot collide", () => {
  assert.match(migration, /COALESCE\(MAX\(sort_order\), -1\) \+ 1/);
  assert.doesNotMatch(migration, /sort_order[^;]+COUNT\(\*\)/);
});

test("atomic gallery RPC is service-role-only with a pinned search path", () => {
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION insert_invitation_gallery_media\([^)]+\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION insert_invitation_gallery_media\([^)]+\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION insert_invitation_gallery_media\([^)]+\) TO service_role/);
});

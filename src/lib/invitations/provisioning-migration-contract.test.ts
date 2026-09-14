import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/038_invitation_owner_provisioning.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("owner and event provisioning is one atomic database function", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION create_invitation_owner_and_event\(/);
  assert.match(migration, /INSERT INTO public\.invitation_owners/);
  assert.match(migration, /INSERT INTO public\.invitation_events/);
  assert.doesNotMatch(migration, /EXCEPTION WHEN/);
});

test("provisioning RPC is isolated to the service role with a pinned search path", () => {
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION create_invitation_owner_and_event\([^)]+\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION create_invitation_owner_and_event\([^)]+\) TO service_role/);
  assert.doesNotMatch(migration, /TO (anon|authenticated)/);
});

test("provisioning RPC canonicalizes owner email before storage", () => {
  assert.match(migration, /lower\(btrim\(p_owner ->> 'email'\)\)/);
});

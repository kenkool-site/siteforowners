import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/043_administrative_invitation_rsvp.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("administrative RSVP mode reuses the event-locked atomic mutation and only permits updates", () => {
  assert.match(migration, /p_administrative boolean DEFAULT false/);
  assert.match(migration, /FOR UPDATE OF event/);
  assert.match(migration, /p_administrative AND NOT v_is_update[\s\S]*INVITE_INVALID_EDIT_TOKEN/);
  assert.match(migration, /NOT p_administrative[\s\S]*edit_token_hash <> p_edit_token_hash[\s\S]*INVITE_INVALID_EDIT_TOKEN/);
  assert.match(migration, /v_attending_total \+ p_party_size > v_event\.capacity/);
  assert.match(migration, /UPDATE public\.invitation_rsvps/);
});

test("replacement administrative RPC remains service-role-only", () => {
  assert.match(migration, /DROP FUNCTION public\.submit_invitation_rsvp\(uuid, text, text, text, boolean, integer, text\[\], text, text, text, uuid\)/);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_invitation_rsvp\([^)]+\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_invitation_rsvp\([^)]+\) TO service_role/);
});

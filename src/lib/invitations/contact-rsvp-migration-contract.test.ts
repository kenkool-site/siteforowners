import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../../supabase/migrations/051_contact_idempotent_invitation_rsvp.sql", import.meta.url);

test("contact-idempotent RSVP migration preserves the serialized mutation contract", () => {
  assert.equal(existsSync(migrationUrl), true);
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /FOR UPDATE OF event/);
  assert.match(sql, /array_agg\(DISTINCT rsvp\.id\)/);
  assert.match(sql, /INVITE_CONTACT_CONFLICT/);
  assert.match(sql, /v_mutation_kind := 'unchanged'/);
  assert.match(sql, /v_mutation_kind := 'updated'/);
  assert.match(sql, /v_mutation_kind := 'created'/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_invitation_rsvp[\s\S]*TO service_role/);
});

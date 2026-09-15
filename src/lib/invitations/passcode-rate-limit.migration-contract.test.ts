import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/041_invitation_passcode_rate_limit.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("the passcode limiter serializes concurrent attempts by event and hashed IP", () => {
  assert.match(migration, /CREATE TABLE public\.invitation_passcode_rate_limits/);
  assert.match(migration, /PRIMARY KEY \(event_id, ip_hash\)/);
  assert.match(migration, /INSERT INTO public\.invitation_passcode_rate_limits[\s\S]*ON CONFLICT \(event_id, ip_hash\) DO UPDATE/);
  assert.match(migration, /WHERE current_limit\.window_started_at[\s\S]*OR current_limit\.attempt_count < p_max_attempts/);
});

test("only service-role code can execute the passcode limiter", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.attempt_invitation_passcode_rate_limit\(uuid, text, integer, integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.attempt_invitation_passcode_rate_limit\(uuid, text, integer, integer\) TO service_role/);
});

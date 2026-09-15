import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/036_invitation_events_foundation.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("an event end time requires a later start time", () => {
  assert.match(
    migration,
    /CHECK \(ends_at IS NULL OR \(starts_at IS NOT NULL AND ends_at > starts_at\)\)/,
  );
});

test("RSVP contact constraint rejects blank contact values", () => {
  assert.match(
    migration,
    /CHECK \( ?NULLIF\(regexp_replace\(email, '\[\[:space:\]\]', '', 'g'\), ''\) IS NOT NULL OR NULLIF\(regexp_replace\(phone, '\[\[:space:\]\]', '', 'g'\), ''\) IS NOT NULL ?\)/,
  );
  assert.doesNotMatch(migration, /NULLIF\(BTRIM\((email|phone), ''\)/);
});

test("owner emails are stored in canonical lowercase trimmed form", () => {
  assert.match(migration, /email text NOT NULL CHECK \(email = lower\(btrim\(email\)\)\)/);
});

test("representative whitespace-only contact values normalize to empty", () => {
  for (const value of [" ", "\t", "\n", "\r", "\f", "\v"]) {
    assert.equal(value.replace(/\s/g, ""), "");
  }
});

test("notifications reference an RSVP belonging to the same event", () => {
  assert.match(migration, /UNIQUE \(event_id, id\)/);
  assert.match(
    migration,
    /FOREIGN KEY \(event_id, rsvp_id\) REFERENCES invitation_rsvps \(event_id, id\) ON DELETE CASCADE/,
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/068_memory_guests_of_honor.sql", import.meta.url),
  "utf8",
);

test("guests of honor tables are host-service only", () => {
  for (const table of ["memory_honor_sets", "memory_honorees", "memory_honor_matches"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(migration, new RegExp(`REVOKE ALL ON public\\.${table} FROM anon, authenticated`));
  }
});

test("one honor set per event, and removing it deletes faces and matches", () => {
  assert.match(migration, /event_id uuid NOT NULL UNIQUE REFERENCES public\.invitation_events/);
  assert.match(migration, /honor_set_id uuid NOT NULL REFERENCES public\.memory_honor_sets\(id\) ON DELETE CASCADE/);
  assert.match(migration, /honoree_id uuid NOT NULL REFERENCES public\.memory_honorees\(id\) ON DELETE CASCADE/);
  assert.match(migration, /excluded boolean NOT NULL DEFAULT false/);
});

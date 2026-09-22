import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/056_invitation_memories_foundation.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("moderation_status includes the five-value enum, in order of severity discussion", () => {
  const idx = migration.indexOf(
    "CHECK (moderation_status IN ('pending', 'awaiting_host_review', 'approved', 'flagged', 'rejected'))",
  );
  assert.ok(idx >= 0, "moderation_status CHECK constraint must list all five values exactly");
});

test("memory_media enforces a unique original object key", () => {
  assert.ok(migration.includes("object_key_original text NOT NULL UNIQUE"));
});

test("memory_moments rejects an inverted or zero-length time window", () => {
  assert.ok(migration.includes("CHECK (ends_at > starts_at)"));
});

test("memory_moment_media has exactly one override row per media item", () => {
  const idx = migration.indexOf("CREATE TABLE IF NOT EXISTS public.memory_moment_media");
  const pk = migration.indexOf("media_id uuid PRIMARY KEY", idx);
  assert.ok(idx >= 0 && pk > idx, "media_id must be the primary key, not a composite key");
});

test("every CREATE TABLE is re-runnable", () => {
  // A bare `CREATE TABLE` errors on a second apply; every table in this
  // migration must be guarded so re-running the file is a no-op.
  assert.equal(
    /CREATE TABLE (?!IF NOT EXISTS)/.test(migration),
    false,
    "every CREATE TABLE must use IF NOT EXISTS",
  );
});

test("deleting an RSVP nulls the uploader link instead of blocking the delete", () => {
  // invitationRepository.removeResponse() deletes invitation_rsvps rows; a bare
  // REFERENCES (NO ACTION) would make that fail with an FK violation as soon as
  // any RSVP guest has uploaded a memory.
  assert.ok(
    migration.includes(
      "uploader_rsvp_id uuid REFERENCES public.invitation_rsvps(id) ON DELETE SET NULL",
    ),
  );
});

test("memory rows are cleaned up when their parent event, media, or moment is deleted", () => {
  for (const fk of [
    "event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE",
    "media_id uuid PRIMARY KEY REFERENCES public.memory_media(id) ON DELETE CASCADE",
    "moment_id uuid NOT NULL REFERENCES public.memory_moments(id) ON DELETE CASCADE",
    "media_id uuid NOT NULL REFERENCES public.memory_media(id) ON DELETE CASCADE",
  ]) {
    assert.ok(migration.includes(fk), `${fk} must cascade`);
  }
});

test("every new table enables row level security", () => {
  for (const table of [
    "memory_media",
    "memory_upload_sessions",
    "memory_moments",
    "memory_moment_media",
    "memory_processing_jobs",
  ]) {
    assert.ok(
      migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
      `${table} must enable RLS`,
    );
  }
});

test("invitation_events gains a mode column constrained to the two designed modes", () => {
  assert.ok(
    migration.includes("CHECK (memories_mode IN ('auto_publish', 'review_required'))"),
  );
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/055_invitation_broadcast_messages.sql", import.meta.url),
  "utf8",
);
const migration = rawMigration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("invitation_broadcasts requires a subject only for email broadcasts", () => {
  assert.match(migration, /CREATE TABLE public\.invitation_broadcasts/);
  assert.match(migration, /channel text NOT NULL CHECK \(channel IN \('email', 'sms'\)\)/);
  assert.match(migration, /CHECK \(channel <> 'email' OR NULLIF\(btrim\(subject\), ''\) IS NOT NULL\)/);
});

test("invitation_broadcasts is service-role-only like every other invitation table", () => {
  assert.match(migration, /ALTER TABLE public\.invitation_broadcasts ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.invitation_broadcasts FROM anon, authenticated/);
});

test("invitation_notifications gains a nullable broadcast_id and a widened kind check", () => {
  assert.match(migration, /ALTER TABLE public\.invitation_notifications\s*ADD COLUMN broadcast_id uuid REFERENCES public\.invitation_broadcasts\(id\) ON DELETE CASCADE/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS invitation_notifications_kind_check/);
  assert.match(migration, /CHECK \(kind IN \('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'\)\)/);
});

test("sms_notification_limit default rises to 100 and existing rows at the old default are backfilled", () => {
  assert.match(migration, /ALTER COLUMN sms_notification_limit SET DEFAULT 100/);
  assert.match(migration, /UPDATE public\.invitation_events\s*SET sms_notification_limit = 100\s*WHERE sms_notification_limit = 50/);
});

test("reserve_invitation_notification's old 6-parameter overload is dropped before the widened version is created, avoiding a duplicate overload", () => {
  const dropIndex = migration.indexOf("DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text)");
  const createIndex = migration.indexOf("CREATE FUNCTION public.reserve_invitation_notification");
  assert.ok(dropIndex >= 0, "expected the old 6-parameter overload to be explicitly dropped");
  assert.ok(createIndex > dropIndex, "expected the widened function to be created after the drop");
});

test("the widened reservation function accepts an optional broadcast_id and validates the new kind", () => {
  assert.match(migration, /p_broadcast_id uuid DEFAULT NULL/);
  assert.match(migration, /p_kind NOT IN \('rsvp_created', 'rsvp_updated', 'guest_confirmation', 'celebrant_broadcast'\)/);
  assert.match(migration, /INSERT INTO public\.invitation_notifications \(\s*event_id, rsvp_id, audience, channel, recipient, kind, status, broadcast_id\s*\)/);
});

test("the widened reservation function is re-secured for service_role only under its new signature", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid\) TO service_role/);
});

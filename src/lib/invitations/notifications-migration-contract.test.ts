import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/042_invitation_notification_reservation.sql", import.meta.url),
  "utf8",
);
// Strip SQL line comments first so prose in the header/smoke-test notes
// (which deliberately mentions phrases like "FOR UPDATE" and "suppressed")
// cannot be mistaken for the executable statements below.
const migration = rawMigration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("reservation locks the event before counting attempts and inserting either a pending or suppressed row", () => {
  const lock = migration.indexOf("FOR UPDATE");
  const count = migration.indexOf("status IN ('pending', 'sent', 'failed')");
  const suppressed = migration.indexOf("'suppressed'");
  const pending = migration.indexOf("'pending'", suppressed + 1);
  assert.ok(lock >= 0 && count > lock && suppressed > count && pending > suppressed);
});

test("suppressed rows never consume capacity: the count excludes 'suppressed' status", () => {
  const countClauseStart = migration.indexOf("SELECT pg_catalog.count(*)::integer INTO v_count FROM public.invitation_notifications WHERE event_id = p_event_id");
  assert.ok(countClauseStart >= 0);
  const clause = migration.slice(countClauseStart, countClauseStart + 300);
  assert.match(clause, /status IN \('pending', 'sent', 'failed'\)/);
  assert.doesNotMatch(clause, /'suppressed'/);
});

test("retry only proceeds for a currently-failed notification and locks it before re-checking the limit", () => {
  const lock = migration.indexOf("FROM public.invitation_notifications AS notification WHERE notification.id = p_notification_id FOR UPDATE");
  const statusCheck = migration.indexOf("v_notification.status <> 'failed'");
  assert.ok(lock >= 0 && statusCheck > lock);
});

test("retry excludes the row being retried from its own limit re-check", () => {
  const recheckStart = migration.indexOf("SELECT pg_catalog.count(*)::integer INTO v_count FROM public.invitation_notifications WHERE event_id = v_notification.event_id");
  assert.ok(recheckStart >= 0);
  const clause = migration.slice(recheckStart, recheckStart + 300);
  assert.match(clause, /id <> p_notification_id/);
});

test("retry leaves a limit-reached notification untouched rather than reclassifying it", () => {
  const limitBranch = migration.indexOf("IF v_count >= v_limit THEN RETURN QUERY SELECT false, 'limit_reached'");
  assert.ok(limitBranch >= 0);
  // No UPDATE statement appears between the limit check and its RETURN/END,
  // i.e. the row's status is not changed on this branch.
  const nextUpdate = migration.indexOf("UPDATE public.invitation_notifications", limitBranch);
  const returnAfterBranch = migration.indexOf("RETURN;", limitBranch);
  assert.ok(returnAfterBranch >= 0 && (nextUpdate === -1 || nextUpdate > returnAfterBranch));
});

test("both reservation functions are service-role-only with pinned search paths", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reserve_invitation_notification[\s\S]*?SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.retry_invitation_notification[\s\S]*?SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\([^)]+\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\([^)]+\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_notification\([^)]+\) TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.retry_invitation_notification\(uuid\) FROM PUBLIC/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.retry_invitation_notification\(uuid\) FROM anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.retry_invitation_notification\(uuid\) TO service_role/);
});

test("reservation validates audience, channel, and kind against the schema's own CHECK constraints", () => {
  assert.match(migration, /p_audience NOT IN \('owner', 'guest'\)/);
  assert.match(migration, /p_channel NOT IN \('email', 'sms'\)/);
  assert.match(migration, /p_kind NOT IN \('rsvp_created', 'rsvp_updated', 'guest_confirmation'\)/);
});

test("migration documents reproducible concurrency smoke commands", () => {
  assert.match(rawMigration, /Concurrency smoke: reservation cap/i);
  assert.match(rawMigration, /Concurrency smoke: retry respects a lowered limit/i);
});

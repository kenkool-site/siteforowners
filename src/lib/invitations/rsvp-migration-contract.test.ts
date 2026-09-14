import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/040_submit_invitation_rsvp.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("RSVP mutation locks the event before lifecycle, limit, duplicate, and capacity checks", () => {
  const lock = migration.indexOf("FOR UPDATE");
  const state = migration.indexOf("INVITE_RSVP_CLOSED");
  const submission = migration.indexOf("INVITE_SUBMISSION_LIMIT_REACHED");
  const duplicate = migration.indexOf("INVITE_DUPLICATE_CONTACT");
  const capacity = migration.indexOf("INVITE_CAPACITY_REACHED");
  const mutation = migration.indexOf("INSERT INTO public.invitation_rsvps");
  assert.ok(lock >= 0 && state > lock && submission > state && duplicate > submission && capacity > duplicate && mutation > capacity);
});

test("updates authenticate before excluding their row from aggregate capacity", () => {
  assert.match(migration, /edit_token_hash\s*<>\s*p_edit_token_hash[\s\S]*INVITE_INVALID_EDIT_TOKEN/);
  assert.match(migration, /id\s*<>\s*p_existing_rsvp_id/);
  assert.match(migration, /UPDATE public\.invitation_rsvps[\s\S]*WHERE id = p_existing_rsvp_id[\s\S]*AND event_id = p_event_id/);
});

test("effective expiry and deadline block creates while closed edits remain eligible", () => {
  assert.match(migration, /INVITE_EVENT_UNAVAILABLE/);
  assert.match(migration, /v_is_update[\s\S]*INVITE_RSVP_CLOSED/);
  assert.match(migration, /rsvp_deadline <= pg_catalog\.now\(\)/);
  assert.match(migration, /expire_at <= pg_catalog\.now\(\)/);
});

test("the RPC returns mutation kind and only aggregate counts", () => {
  assert.match(migration, /RETURNS TABLE \( rsvp_id uuid, mutation_kind text, attending_total integer, declined_party_total integer, remaining_capacity integer \)/);
  assert.doesNotMatch(migration, /RETURNS TABLE \([^)]*(email|phone|message|additional_guest_names)/);
});

test("RSVP mutation and serialized limiter are service-role-only with pinned search paths", () => {
  assert.match(migration, /CREATE TABLE public\.invitation_rsvp_rate_limits[\s\S]*PRIMARY KEY \(event_id, ip_hash\)/);
  assert.match(migration, /INSERT INTO public\.invitation_rsvp_rate_limits[\s\S]*ON CONFLICT \(event_id, ip_hash\) DO UPDATE/);
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_invitation_rsvp\([^)]+\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_invitation_rsvp\([^)]+\) TO service_role/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.attempt_invitation_rsvp_rate_limit\([^)]+\) TO service_role/);
});

test("capacity check is gated on p_attending so declines and non-increasing edits cannot trigger it", () => {
  assert.match(
    migration,
    /IF\s+p_attending\s+AND\s+v_event\.capacity IS NOT NULL\s+AND\s+v_attending_total \+ p_party_size > v_event\.capacity\s+THEN\s+RAISE EXCEPTION USING MESSAGE = 'INVITE_CAPACITY_REACHED';/,
  );

  const capacityIndex = migration.indexOf("INVITE_CAPACITY_REACHED");
  const guardStart = migration.lastIndexOf("IF ", capacityIndex);
  const guard = migration.slice(guardStart, capacityIndex);
  assert.match(guard, /\bp_attending\b/);
  assert.doesNotMatch(guard, /NOT\s+p_attending/);
});

test("migration documents reproducible final-seat and party-increase concurrency smoke commands", () => {
  assert.match(migration, /Concurrency smoke: final seat/i);
  assert.match(migration, /Concurrency smoke: simultaneous party increases/i);
  assert.match(migration, /INVITE_CAPACITY_REACHED/);
});

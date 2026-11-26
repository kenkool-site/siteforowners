import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_EMAIL_BROADCAST_LIMIT, MAX_EMAIL_BROADCAST_LIMIT } from "./email-broadcast-limit";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/071_invitation_email_broadcast_limit.sql", import.meta.url),
  "utf8",
);
const migration = rawMigration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("email_broadcast_limit is a nullable per-event override capped at the app maximum", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS email_broadcast_limit integer/);
  assert.match(migration, /email_broadcast_limit IS NULL OR \(email_broadcast_limit > 0 AND email_broadcast_limit <= 1000000\)/);
  assert.match(migration, new RegExp(String(MAX_EMAIL_BROADCAST_LIMIT)));
  assert.match(migration, new RegExp(String(DEFAULT_EMAIL_BROADCAST_LIMIT)));
  assert.match(rawMigration, /INVITATION_EMAIL_BROADCAST_LIMIT/);
});

test("the previous reserve and retry overloads are dropped before the email-budget versions are created", () => {
  const reserveDrop = migration.indexOf("DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid, integer)");
  const reserveCreate = migration.indexOf("CREATE FUNCTION public.reserve_invitation_notification");
  assert.ok(reserveDrop >= 0 && reserveCreate > reserveDrop);
  assert.match(migration, /p_platform_email_broadcast_limit integer DEFAULT NULL/);
  const retryDrop = migration.indexOf("DROP FUNCTION IF EXISTS public.retry_invitation_notification(uuid, integer)");
  const retryCreate = migration.indexOf("CREATE FUNCTION public.retry_invitation_notification");
  assert.ok(retryDrop >= 0 && retryCreate > retryDrop);
});

test("guest email broadcasts are not blocked by host alert usage", () => {
  assert.match(migration, /v_broadcast_email := p_channel = 'email' AND p_kind = 'celebrant_broadcast'/);
  assert.match(migration, /v_limit := COALESCE\(v_event\.email_broadcast_limit, v_email_platform, 1000\)/);
  assert.match(migration, /notification\.channel = 'email' AND notification\.kind = 'celebrant_broadcast'/);
  assert.match(migration, /notification\.channel = 'email' AND notification\.kind <> 'celebrant_broadcast'/);
  assert.match(migration, /v_event\.email_notification_limit/);
  assert.match(migration, /v_notification\.channel = 'email' AND v_notification\.kind = 'celebrant_broadcast'/);
});

test("retry uses the same email split and still excludes the row being retried", () => {
  assert.match(migration, /notification\.id <> p_notification_id/);
  const limitBranch = migration.indexOf("IF v_count >= v_limit THEN RETURN QUERY SELECT false, 'limit_reached'");
  const updateAfter = migration.indexOf("UPDATE public.invitation_notifications", limitBranch);
  const returnAfter = migration.indexOf("RETURN;", limitBranch);
  assert.ok(limitBranch >= 0 && returnAfter > limitBranch && updateAfter > returnAfter);
});

test("both functions stay service-role only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid, integer, integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid, integer, integer\) TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.retry_invitation_notification\(uuid, integer, integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.retry_invitation_notification\(uuid, integer, integer\) TO service_role/);
});

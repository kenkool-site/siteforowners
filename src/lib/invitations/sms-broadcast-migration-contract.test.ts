import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_SMS_BROADCAST_LIMIT, MAX_SMS_BROADCAST_LIMIT } from "./sms-broadcast-limit";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/070_invitation_sms_broadcast_limit.sql", import.meta.url),
  "utf8",
);
const migration = rawMigration.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

test("sms_broadcast_limit is a nullable per-event override capped at the app maximum", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS sms_broadcast_limit integer/);
  assert.match(migration, /sms_broadcast_limit IS NULL OR \(sms_broadcast_limit > 0 AND sms_broadcast_limit <= 1000000\)/);
  assert.match(migration, new RegExp(String(MAX_SMS_BROADCAST_LIMIT)));
  assert.match(migration, new RegExp(String(DEFAULT_SMS_BROADCAST_LIMIT)));
  assert.match(rawMigration, /INVITATION_SMS_BROADCAST_LIMIT/);
});

test("the previous reserve overload is dropped before the broadcast-budget version is created", () => {
  const dropIndex = migration.indexOf("DROP FUNCTION IF EXISTS public.reserve_invitation_notification(uuid, uuid, text, text, text, text, uuid)");
  const createIndex = migration.indexOf("CREATE FUNCTION public.reserve_invitation_notification");
  assert.ok(dropIndex >= 0);
  assert.ok(createIndex > dropIndex);
  assert.match(migration, /p_platform_sms_broadcast_limit integer DEFAULT NULL/);
});

test("guest broadcast SMS uses its own limit and host RSVP SMS does not count those rows", () => {
  assert.match(migration, /v_broadcast_sms := p_channel = 'sms' AND p_kind = 'celebrant_broadcast'/);
  assert.match(migration, /v_limit := COALESCE\(v_event\.sms_broadcast_limit, v_platform, 500\)/);
  assert.match(migration, /notification\.kind = 'celebrant_broadcast'/);
  assert.match(migration, /notification\.kind <> 'celebrant_broadcast'/);
  assert.match(migration, /ELSE v_event\.sms_notification_limit/);
});

test("retry uses the same split and still excludes the row being retried", () => {
  const dropIndex = migration.indexOf("DROP FUNCTION IF EXISTS public.retry_invitation_notification(uuid)");
  const createIndex = migration.indexOf("CREATE FUNCTION public.retry_invitation_notification");
  assert.ok(dropIndex >= 0 && createIndex > dropIndex);
  assert.match(migration, /v_notification\.kind = 'celebrant_broadcast'/);
  assert.match(migration, /notification\.id <> p_notification_id/);
  const limitBranch = migration.indexOf("IF v_count >= v_limit THEN RETURN QUERY SELECT false, 'limit_reached'");
  const updateAfter = migration.indexOf("UPDATE public.invitation_notifications", limitBranch);
  const returnAfter = migration.indexOf("RETURN;", limitBranch);
  assert.ok(limitBranch >= 0 && returnAfter > limitBranch && updateAfter > returnAfter);
});

test("both functions stay service-role only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid, integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.reserve_invitation_notification\(uuid, uuid, text, text, text, text, uuid, integer\) TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.retry_invitation_notification\(uuid, integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.retry_invitation_notification\(uuid, integer\) TO service_role/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("migration 035 backfills legacy text delivery before defaults and constraints", async () => {
  const sql = await readFile("supabase/migrations/035_estimate_delivery_channels.sql", "utf8");
  const add = sql.indexOf("ADD COLUMN IF NOT EXISTS text_notification_state text");
  const backfill = sql.indexOf("UPDATE estimate_requests");
  const defaults = sql.indexOf("ALTER COLUMN text_notification_state SET DEFAULT");
  assert.ok(add >= 0 && backfill > add && defaults > backfill);
  assert.match(sql, /text_notification_state\s*=\s*notification_state/);
  assert.match(sql, /text_provider_message_id\s*=\s*provider_message_id/);
  assert.match(sql, /text_provider_error\s*=\s*provider_error/);
  assert.match(sql, /ALTER COLUMN text_notification_state SET NOT NULL/);
});

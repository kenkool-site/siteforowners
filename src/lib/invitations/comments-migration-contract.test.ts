import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../../supabase/migrations/053_invitation_comment_wall.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("comment wall migration is private, constrained, indexed, and service-role only", () => {
  assert.match(sql, /comment_wall_enabled boolean NOT NULL DEFAULT false/i);
  assert.match(sql, /comment_wall_reviewed_at timestamptz/i);
  assert.match(sql, /CREATE TABLE public\.invitation_comments/i);
  assert.match(sql, /CHECK \(char_length\(btrim\(guest_name\)\) BETWEEN 1 AND 80\)/i);
  assert.match(sql, /CHECK \(char_length\(btrim\(body\)\) BETWEEN 1 AND 1000\)/i);
  assert.match(sql, /invitation_comments_event_created_idx .*event_id, created_at DESC, id DESC/i);
  assert.match(sql, /ALTER TABLE public\.invitation_comments ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql, /REVOKE ALL ON public\.invitation_comments, public\.invitation_comment_submissions FROM anon, authenticated/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.submit_invitation_comment/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.submit_invitation_comment\(uuid, text, text, text, text\) TO service_role/i);
  assert.match(sql, /COMMENT_WALL_CLOSED/);
  assert.match(sql, /COMMENT_RATE_LIMITED/);
});

test("comment submission is serialized and checks duplicates before quota", () => {
  const lock = sql.indexOf("pg_advisory_xact_lock");
  const duplicate = sql.indexOf("SELECT recent.comment_id INTO v_duplicate_id");
  const quota = sql.indexOf("SELECT pg_catalog.count(*)::integer INTO v_recent_count");
  assert.ok(lock >= 0 && duplicate > lock && quota > duplicate);
  assert.match(sql, /pg_catalog\.now\(\) - pg_catalog\.make_interval\(mins => 2\)/i);
  assert.match(sql, /pg_catalog\.now\(\) - pg_catalog\.make_interval\(mins => 10\)/i);
});

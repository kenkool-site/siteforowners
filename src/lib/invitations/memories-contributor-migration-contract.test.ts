import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Memories media stores a stable contributor session id", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/057_memory_media_contributor_session.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists uploader_session_id uuid/i);
  assert.match(sql, /memory_media_event_contributor_idx/i);
});

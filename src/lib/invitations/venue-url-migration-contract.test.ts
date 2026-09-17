import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../../../supabase/migrations/054_invitation_venue_url.sql", import.meta.url);

test("venue website migration adds an optional HTTPS-only event column", () => {
  assert.equal(existsSync(migrationUrl), true, "venue URL migration must exist");
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists venue_url text/i);
  assert.match(sql, /venue_url is null[\s\S]*venue_url ~\* '\^https:\/\/'/i);
});

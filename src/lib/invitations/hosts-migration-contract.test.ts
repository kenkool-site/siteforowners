import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/050_invitation_hosts_and_style_guide.sql", import.meta.url);

test("host and style migration preserves primary ownership while adding one co-host", () => {
  assert.equal(existsSync(migrationUrl), true, "host/style migration must exist");
  if (!existsSync(migrationUrl)) return;
  const migration = readFileSync(migrationUrl, "utf8");
  assert.match(migration, /ADD COLUMN IF NOT EXISTS style_guide jsonb/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS (?:public\.)?invitation_event_hosts/);
  assert.match(migration, /role text NOT NULL CHECK \(role IN \('primary', 'cohost'\)\)/);
  assert.match(migration, /invitation_event_hosts_one_primary_idx[\s\S]*WHERE role = 'primary'/);
  assert.match(migration, /invitation_event_hosts_one_cohost_idx[\s\S]*WHERE role = 'cohost'/);
  assert.match(migration, /SELECT id, owner_id, 'primary'[\s\S]*FROM (?:public\.)?invitation_events/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sync_invitation_primary_host/);
  assert.match(migration, /CREATE TRIGGER invitation_events_sync_primary_host/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_invitation_cohost/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.remove_invitation_cohost/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.set_invitation_cohost[\s\S]*TO service_role/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON invitation_event_hosts FROM anon, authenticated/);
});

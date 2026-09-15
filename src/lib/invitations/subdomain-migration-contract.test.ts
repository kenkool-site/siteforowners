import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL("../../../supabase/migrations/049_invitation_subdomains.sql", import.meta.url);

test("invitation subdomain migration creates a shared, exclusive reservation registry", () => {
  assert.equal(existsSync(migrationUrl), true, "invitation subdomain migration must exist");
  if (!existsSync(migrationUrl)) return;
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS public_subdomain text UNIQUE/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS platform_subdomains/i);
  assert.match(sql, /PRIMARY KEY/i);
  assert.match(sql, /num_nonnulls\(tenant_id, invitation_event_id\) = 1/i);
  assert.match(sql, /UNIQUE \(tenant_id\)/i);
  assert.match(sql, /UNIQUE \(invitation_event_id\)/i);
});

test("migration backfills tenants and synchronizes both resource tables", () => {
  assert.equal(existsSync(migrationUrl), true, "invitation subdomain migration must exist");
  if (!existsSync(migrationUrl)) return;
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /INSERT INTO platform_subdomains[\s\S]+FROM tenants[\s\S]+WHERE subdomain IS NOT NULL/i);
  assert.match(sql, /CREATE TRIGGER sync_tenant_subdomain/i);
  assert.match(sql, /CREATE TRIGGER sync_invitation_subdomain/i);
  assert.match(sql, /PLATFORM_SUBDOMAIN_TAKEN/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION create_invitation_owner_and_event/);
  assert.match(sql, /owner_id, slug, public_subdomain/);
});

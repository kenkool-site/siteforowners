// src/lib/invitations/memories/repository-missing-descriptors-rpc.integration.test.ts
//
// Every other test touching repository.ts is a `.toString()` source-contract
// check (see repository.test.ts's own header comment: createAdminClient()
// throws on missing env before a query is ever sent, and this codebase has no
// CI/local Supabase credentials wired up for live queries). That's fine for
// asserting query *shape*, but it cannot prove SQL *behavior* — and this file
// exists specifically because a source-shape check is not what's needed here.
//
// Task 5's original listApprovedMediaMissingDescriptorsAcrossEvents had a real
// bug: it capped the initial "approved media" scan at 200 rows (oldest first)
// and only filtered out already-described ones AFTER that fetch, so once the
// platform's oldest 200 qualifying rows were all described (the normal
// steady state), the query returned [] forever — genuinely undescribed rows
// past that fixed window were never even considered. The fix moves the
// "missing descriptor" test into a real SQL anti-join (see migration
// 059_memory_highlight_missing_descriptors_rpc.sql) so there is no window to
// fall outside of. A `.toString()` check on the TS wrapper can confirm it
// calls that RPC by name (see repository.test.ts) but cannot confirm the SQL
// itself actually finds a row outside a 200-row prefix — only executing it
// can.
//
// So this test spins up a throwaway Postgres in Docker, applies the actual
// migration file's SQL verbatim (not a hand-copied duplicate that could
// drift from it) against a minimal stand-in schema, reproduces the exact bug
// scenario (200 already-described rows, plus genuinely-undescribed rows
// beyond that window), and asserts the undescribed rows are still found. It
// skips itself cleanly wherever Docker isn't available (this is the only
// test in the repo with that dependency) rather than failing the suite.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const CONTAINER_NAME = `sfo-task5-verify-${randomUUID().slice(0, 8)}`;

function dockerAvailable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function psql(port: string, sql: string): string {
  const result = spawnSync("psql", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "verify", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "test" },
  });
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

test("listApprovedMediaMissingDescriptorsAcrossEvents's SQL still finds undescribed media past a 200-row already-described prefix", async (t) => {
  if (!dockerAvailable()) {
    t.skip("Docker is not available in this environment — see file header for what this test verifies and why it can't be a plain unit test");
    return;
  }

  const migrationSql = readFileSync(
    new URL("../../../../supabase/migrations/059_memory_highlight_missing_descriptors_rpc.sql", import.meta.url),
    "utf8",
  );

  let port = "";
  try {
    // Publish the container's 5432 to a random free host port (bare `-p 5432`,
    // no host part) so concurrent runs/other local Postgres instances can
    // never collide with this test.
    execFileSync("docker", [
      "run", "--rm", "-d",
      "--name", CONTAINER_NAME,
      "-e", "POSTGRES_PASSWORD=test",
      "-e", "POSTGRES_DB=verify",
      "-p", "5432",
      "postgres:15",
    ]);
    port = execFileSync("docker", ["port", CONTAINER_NAME, "5432/tcp"])
      .toString()
      .trim()
      .split("\n")[0]
      .split(":")
      .pop() as string;

    // Wait for Postgres to accept connections (fresh container, cold start).
    const deadline = Date.now() + 20_000;
    for (;;) {
      const probe = spawnSync("psql", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "postgres", "-c", "select 1"], {
        env: { ...process.env, PGPASSWORD: "test" },
      });
      if (probe.status === 0) break;
      if (Date.now() > deadline) throw new Error("Postgres did not become ready in time");
      spawnSync("sleep", ["1"]);
    }

    // Minimal stand-in for the two real tables (see 056/058's real
    // definitions) — just the columns this migration's function/index touch.
    // Plain postgres:15 has none of Supabase's platform roles, but the real
    // migration file's REVOKE/GRANT lines reference them — stand them in so
    // the migration can be applied completely unmodified below.
    psql(port, "create extension if not exists pgcrypto;");
    psql(port, "create role anon; create role authenticated; create role service_role;");
    psql(
      port,
      `create table public.memory_media (
         id uuid primary key default gen_random_uuid(),
         event_id uuid not null,
         media_kind text not null,
         object_key_display text,
         uploaded_at timestamptz not null default now(),
         upload_status text not null default 'pending',
         moderation_status text not null default 'pending',
         processing_status text not null default 'ready'
       );`,
    );
    psql(
      port,
      `create table public.memory_media_descriptors (
         media_id uuid primary key references public.memory_media(id) on delete cascade,
         descriptor_version text not null,
         labels jsonb not null default '[]'::jsonb,
         embedding jsonb,
         transcript_cues jsonb,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );`,
    );

    // The real migration file, executed verbatim — not a hand-copied
    // transcription that could silently drift from what actually ships.
    execFileSync("psql", ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", "verify", "-v", "ON_ERROR_STOP=1"], {
      input: migrationSql,
      env: { ...process.env, PGPASSWORD: "test" },
    });

    // The exact bug scenario: 250 approved+uploaded rows, oldest 200 (by
    // uploaded_at) all already described, the newest 50 undescribed. The old
    // "scan oldest 200, then filter" implementation would return [] here
    // forever — the whole undescribed backlog sits outside that window.
    psql(
      port,
      `insert into public.memory_media (id, event_id, media_kind, uploaded_at, upload_status, moderation_status)
       select gen_random_uuid(), gen_random_uuid(), 'photo',
              now() - ((250 - n) || ' minutes')::interval, 'uploaded', 'approved'
       from generate_series(1, 250) as n;`,
    );
    psql(
      port,
      `insert into public.memory_media_descriptors (media_id, descriptor_version, labels)
       select id, 'rekognition-v1', '[]'::jsonb
       from public.memory_media order by uploaded_at asc limit 200;`,
    );

    const undescribedCount = psql(
      port,
      `select count(*) from public.memory_media m
       where not exists (select 1 from public.memory_media_descriptors d where d.media_id = m.id);`,
    );
    assert.equal(undescribedCount, "50", "test setup sanity check: expected exactly 50 undescribed rows");

    const found = psql(port, "select media_id from public.list_approved_media_missing_descriptors_across_events(5);");
    const foundIds = found.split("\n").filter(Boolean);
    assert.equal(foundIds.length, 5, "the RPC must return exactly p_limit rows when at least that many are missing");

    const groundTruth = psql(
      port,
      `select m.id from public.memory_media m
       left join public.memory_media_descriptors d on d.media_id = m.id
       where m.moderation_status = 'approved' and m.upload_status = 'uploaded' and d.media_id is null
       order by m.uploaded_at asc limit 5;`,
    );
    assert.deepEqual(foundIds, groundTruth.split("\n").filter(Boolean), "RPC result must match a hand-written anti-join, oldest-first");

    // Describe every remaining row and confirm the RPC empties out cleanly
    // (no error, no stale/false positives) rather than, say, erroring on an
    // empty result set.
    psql(
      port,
      `insert into public.memory_media_descriptors (media_id, descriptor_version, labels)
       select id, 'rekognition-v1', '[]'::jsonb from public.memory_media
       where id not in (select media_id from public.memory_media_descriptors);`,
    );
    const afterFullyDescribed = psql(port, "select count(*) from public.list_approved_media_missing_descriptors_across_events(5);");
    assert.equal(afterFullyDescribed, "0");

    // Fix 5: a media item that is approved, uploaded, and undescribed but
    // failed processing (processing_status <> 'ready') must never be
    // returned — it would never be resolvable/visible to a guest anyway (see
    // gallery.ts's listGalleryVisibleMedia, which requires processing_status
    // = 'ready'), so backfilling it a descriptor and letting it get grouped
    // would be pure waste.
    const processingFailedId = psql(
      port,
      `insert into public.memory_media (event_id, media_kind, uploaded_at, upload_status, moderation_status, processing_status)
       values (gen_random_uuid(), 'photo', now(), 'uploaded', 'approved', 'processing_failed')
       returning id;`,
    );
    const foundAfterProcessingFailedInsert = psql(
      port,
      `select 1 from public.list_approved_media_missing_descriptors_across_events(1000) where media_id = '${processingFailedId}';`,
    );
    assert.equal(foundAfterProcessingFailedInsert, "", "a processing_failed media item must be excluded even though it is undescribed");
  } finally {
    spawnSync("docker", ["stop", CONTAINER_NAME], { stdio: "ignore" });
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../../../../supabase/migrations/058_memory_highlight_grouping.sql", import.meta.url),
  "utf8",
).replace(/\s+/g, " ");

test("all four highlight tables are created", () => {
  for (const table of [
    "memory_media_descriptors",
    "memory_highlight_groups",
    "memory_highlight_generations",
    "memory_highlight_media",
  ]) {
    assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), `${table} must be created`);
  }
});

test("every new highlight table enables row level security and defines no policies", () => {
  for (const table of [
    "memory_media_descriptors",
    "memory_highlight_groups",
    "memory_highlight_generations",
    "memory_highlight_media",
  ]) {
    assert.ok(
      sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
      `${table} must enable RLS`,
    );
  }
  assert.doesNotMatch(sql, /CREATE POLICY/i);
});

test("highlight rows cascade when their parent event, group, media, or generation is deleted", () => {
  for (const fk of [
    "media_id uuid PRIMARY KEY REFERENCES public.memory_media(id) ON DELETE CASCADE",
    "event_id uuid NOT NULL REFERENCES public.invitation_events(id) ON DELETE CASCADE",
    "group_id uuid NOT NULL REFERENCES public.memory_highlight_groups(id) ON DELETE CASCADE",
    "media_id uuid NOT NULL REFERENCES public.memory_media(id) ON DELETE CASCADE",
    "generation_id uuid NOT NULL REFERENCES public.memory_highlight_generations(id) ON DELETE CASCADE",
  ]) {
    assert.ok(sql.includes(fk), `${fk} must cascade`);
  }
});

test("highlight membership is many-to-many and generation scoped", () => {
  assert.match(sql, /PRIMARY KEY \(generation_id, group_id, media_id\)/);
  assert.match(sql, /generation_id uuid NOT NULL REFERENCES public\.memory_highlight_generations\(id\) ON DELETE CASCADE/);
});

test("only one queued or processing generation may exist per event", () => {
  assert.ok(sql.includes("CREATE UNIQUE INDEX IF NOT EXISTS memory_highlight_generations_one_pending_idx"));
  assert.ok(sql.includes("ON public.memory_highlight_generations (event_id)"));
  assert.ok(sql.includes("WHERE status IN ('queued', 'processing')"));
});

test("memory_highlight_groups keeps a stable semantic key per event and source", () => {
  assert.ok(sql.includes("UNIQUE (event_id, source, semantic_key)"));
  assert.ok(sql.includes("CHECK (source IN ('fallback', 'ai_generated', 'host_defined'))"));
});

test("invitation_events gains highlight settings and generation state", () => {
  for (const fragment of [
    "highlight_mode text NOT NULL DEFAULT 'automatic'",
    "CHECK (highlight_mode IN ('automatic', 'host_defined'))",
    "published_highlight_generation_id uuid REFERENCES public.memory_highlight_generations(id) ON DELETE SET NULL",
    "pending_highlight_generation_id uuid REFERENCES public.memory_highlight_generations(id) ON DELETE SET NULL",
    "highlight_generation_status text NOT NULL DEFAULT 'idle'",
    "CHECK (highlight_generation_status IN ('idle', 'queued', 'processing', 'failed'))",
    "highlight_generation_error text",
    "highlight_last_generated_media_count integer NOT NULL DEFAULT 0",
  ]) {
    assert.ok(sql.includes(fragment), `${fragment} must be present`);
  }
});

test("every CREATE TABLE and CREATE INDEX in this migration is re-runnable", () => {
  assert.equal(/CREATE TABLE (?!IF NOT EXISTS)/.test(sql), false, "every CREATE TABLE must use IF NOT EXISTS");
  assert.equal(
    /CREATE (?:UNIQUE )?INDEX (?!IF NOT EXISTS)/.test(sql),
    false,
    "every CREATE INDEX must use IF NOT EXISTS",
  );
});

test("publish_memory_highlight_generation has the documented signature", () => {
  assert.ok(
    sql.includes(
      "CREATE OR REPLACE FUNCTION public.publish_memory_highlight_generation(p_event_id uuid, p_generation_id uuid, p_media_count integer)",
    ),
  );
});

test("publish_memory_highlight_generation verifies the generation belongs to the event and is processing before publishing", () => {
  assert.ok(sql.includes("AND generation.event_id = p_event_id"));
  assert.ok(sql.includes("v_generation.status <> 'processing'"));
  assert.match(sql, /RAISE EXCEPTION/);
});

test("publish_memory_highlight_generation atomically publishes and updates event pointer, count, status, and clears pending state", () => {
  for (const fragment of [
    "SET status = 'published'",
    "published_highlight_generation_id = p_generation_id",
    "highlight_last_generated_media_count = p_media_count",
    "highlight_generation_status = 'idle'",
    "pending_highlight_generation_id = NULL",
    "highlight_generation_error = NULL",
  ]) {
    assert.ok(sql.includes(fragment), `${fragment} must be present`);
  }
});

test("publish_memory_highlight_generation execution is restricted to the service role", () => {
  assert.ok(
    sql.includes(
      "REVOKE ALL ON FUNCTION public.publish_memory_highlight_generation(uuid, uuid, integer) FROM PUBLIC",
    ),
  );
  assert.ok(
    sql.includes(
      "GRANT EXECUTE ON FUNCTION public.publish_memory_highlight_generation(uuid, uuid, integer) TO service_role",
    ),
  );
});

test("AI Highlights state is separate from Moments", () => {
  assert.doesNotMatch(sql, /ALTER TABLE public\.memory_moments/);
  assert.doesNotMatch(sql, /ALTER TABLE public\.memory_moment_media/);
  assert.match(sql, /published_highlight_generation_id/);
  assert.match(sql, /publish_memory_highlight_generation/);
});

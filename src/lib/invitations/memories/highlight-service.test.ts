// src/lib/invitations/memories/highlight-service.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { backfillMissingMemoryDescriptors, processHighlightGeneration, requestHighlightGeneration } from "./highlight-service";
import type {
  BackfillMissingDescriptorsDependencies,
  ProcessHighlightGenerationDependencies,
  RequestHighlightGenerationDependencies,
} from "./highlight-service";
import type { HighlightAssignment, HighlightProposal } from "./highlight-classifier";
import type {
  HighlightGenerationMode,
  MemoryHighlightGeneration,
  MemoryHighlightGroup,
  MemoryMediaDescriptor,
} from "./highlight-types";
import type { HighlightGenerationState, MemoryMediaSummary } from "./repository";

// Pulls one dependency's exact function type out of the (already-imported)
// service dependency interfaces, so every spy() below can be given an
// explicit generic without repeating a full inline function-type literal —
// and, since TS allows a function value to declare fewer parameters than its
// target type, every fake below can omit parameters it never reads instead
// of naming them just to satisfy an arity it doesn't otherwise need
// (matching highlight-generator.test.ts's own `generateText: async () =>
// ...` convention of never naming an unused parameter).
type ProcessDep<K extends keyof ProcessHighlightGenerationDependencies> = NonNullable<ProcessHighlightGenerationDependencies[K]>;
type RequestDep<K extends keyof RequestHighlightGenerationDependencies> = NonNullable<RequestHighlightGenerationDependencies[K]>;
type BackfillDep<K extends keyof BackfillMissingDescriptorsDependencies> = NonNullable<BackfillMissingDescriptorsDependencies[K]>;

// ---------------------------------------------------------------------------
// Test fixtures and a tiny manual spy helper (no mocking library in this
// codebase's test stack).
// ---------------------------------------------------------------------------

function generation(
  overrides: Partial<MemoryHighlightGeneration> & { id: string; mode: HighlightGenerationMode },
): MemoryHighlightGeneration {
  return {
    eventId: "event-1",
    status: "processing",
    mediaCount: 0,
    errorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    ...overrides,
  };
}

function group(overrides: Partial<MemoryHighlightGroup> & { id: string; semanticKey: string }): MemoryHighlightGroup {
  return {
    eventId: "event-1",
    name: "Untitled",
    description: null,
    source: "fallback",
    sortOrder: 0,
    isVisible: true,
    ...overrides,
  };
}

function descriptor(mediaId: string): MemoryMediaDescriptor {
  return { mediaId, mediaKind: "photo", labels: [] };
}

// A typed manual spy: `fn` is what gets injected as the dependency (matching
// the real function's exact signature via the explicit TFn type argument),
// `calls` records every argument tuple for assertions. `impl` may declare
// fewer parameters than TFn — TypeScript's own function-arity subtyping
// allows that — so a fake that ignores its inputs never has to name them.
function spy<TFn extends (...args: never[]) => unknown>(
  impl: (...args: Parameters<TFn>) => ReturnType<TFn>,
): { fn: TFn; calls: Parameters<TFn>[] } {
  const calls: Parameters<TFn>[] = [];
  const fn = ((...args: Parameters<TFn>) => {
    calls.push(args);
    return impl(...args);
  }) as TFn;
  return { fn, calls };
}

function neverCalled<TFn extends (...args: never[]) => unknown>(label: string): { fn: TFn; calls: Parameters<TFn>[] } {
  const impl = (() => {
    throw new Error(`${label} must not be called for this scenario`);
  }) as unknown as (...args: Parameters<TFn>) => ReturnType<TFn>;
  return spy<TFn>(impl);
}

// A full set of never-called dependency spies for processHighlightGeneration,
// overridden per test with only the seams that scenario actually exercises.
// Keeps each test focused on what it's proving while still catching an
// implementation that reaches a dependency it shouldn't.
function baseProcessDependencies() {
  return {
    claimNextHighlightGeneration: neverCalled<ProcessDep<"claimNextHighlightGeneration">>("claimNextHighlightGeneration"),
    listApprovedMemoryDescriptors: neverCalled<ProcessDep<"listApprovedMemoryDescriptors">>("listApprovedMemoryDescriptors"),
    listMemoryHighlightGroups: neverCalled<ProcessDep<"listMemoryHighlightGroups">>("listMemoryHighlightGroups"),
    createMemoryHighlightGroup: neverCalled<ProcessDep<"createMemoryHighlightGroup">>("createMemoryHighlightGroup"),
    updateMemoryHighlightGroup: neverCalled<ProcessDep<"updateMemoryHighlightGroup">>("updateMemoryHighlightGroup"),
    replaceHighlightGenerationMemberships: neverCalled<ProcessDep<"replaceHighlightGenerationMemberships">>(
      "replaceHighlightGenerationMemberships",
    ),
    publishHighlightGeneration: neverCalled<ProcessDep<"publishHighlightGeneration">>("publishHighlightGeneration"),
    failHighlightGeneration: neverCalled<ProcessDep<"failHighlightGeneration">>("failHighlightGeneration"),
    classifyFallbackHighlights: neverCalled<ProcessDep<"classifyFallbackHighlights">>("classifyFallbackHighlights"),
    generateDynamicHighlights: neverCalled<ProcessDep<"generateDynamicHighlights">>("generateDynamicHighlights"),
    generateHostDefinedAssignments: neverCalled<ProcessDep<"generateHostDefinedAssignments">>("generateHostDefinedAssignments"),
  };
}

function toDeps<T extends Record<string, { fn: unknown }>>(spies: T): { [K in keyof T]: T[K]["fn"] } {
  const result = {} as { [K in keyof T]: T[K]["fn"] };
  for (const key of Object.keys(spies) as (keyof T)[]) result[key] = spies[key].fn;
  return result;
}

// ---------------------------------------------------------------------------
// processHighlightGeneration — the 7 named scenarios
// ---------------------------------------------------------------------------

test("fewer than eight descriptors selects the fallback dictionary classifier, not Anthropic dynamic generation", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-1", mode: "fallback" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1"), descriptor("m2")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  const createGroup = spy<ProcessDep<"createMemoryHighlightGroup">>(async (_eventId, input) =>
    group({ id: "g1", semanticKey: input.semanticKey, name: input.name, description: input.description, source: input.source }),
  );
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  const classifyFallback = spy<ProcessDep<"classifyFallbackHighlights">>(
    (): HighlightProposal[] => [{ semanticKey: "cake", name: "Cake", description: "Cake moments", source: "fallback", mediaIds: ["m1"] }],
  );

  await processHighlightGeneration(
    "gen-1",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      createMemoryHighlightGroup: createGroup,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      classifyFallbackHighlights: classifyFallback,
    }),
  );

  assert.equal(classifyFallback.calls.length, 1);
  assert.equal(base.generateDynamicHighlights.calls.length, 0);
  assert.equal(base.generateHostDefinedAssignments.calls.length, 0);
  assert.equal(publish.calls.length, 1);
  assert.equal(base.failHighlightGeneration.calls.length, 0);
});

test("eight or more descriptors selects Anthropic dynamic generation, not the fallback dictionary", async () => {
  const base = baseProcessDependencies();
  const descriptors = Array.from({ length: 8 }, (_, index) => descriptor(`m${index + 1}`));
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-2", mode: "automatic" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => descriptors);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  let nextGroupId = 0;
  const createGroup = spy<ProcessDep<"createMemoryHighlightGroup">>(async (_eventId, input) => {
    nextGroupId += 1;
    return group({ id: `g${nextGroupId}`, semanticKey: input.semanticKey, name: input.name, description: input.description, source: input.source });
  });
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  const dynamicProposals: HighlightProposal[] = [
    { semanticKey: "cake", name: "Cake", description: null, source: "ai_generated", mediaIds: ["m1", "m2"] },
    { semanticKey: "dancing", name: "Dancing", description: null, source: "ai_generated", mediaIds: ["m3"] },
    { semanticKey: "decor", name: "Decor", description: null, source: "ai_generated", mediaIds: ["m4"] },
    { semanticKey: "gifts", name: "Gifts", description: null, source: "ai_generated", mediaIds: ["m5"] },
  ];
  const generateDynamic = spy<ProcessDep<"generateDynamicHighlights">>(async () => dynamicProposals);

  await processHighlightGeneration(
    "gen-2",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      createMemoryHighlightGroup: createGroup,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      generateDynamicHighlights: generateDynamic,
    }),
  );

  assert.equal(generateDynamic.calls.length, 1);
  assert.equal(base.classifyFallbackHighlights.calls.length, 0);
  assert.equal(base.generateHostDefinedAssignments.calls.length, 0);
  assert.equal(publish.calls.length, 1);
  assert.equal(base.failHighlightGeneration.calls.length, 0);
});

test("host-defined mode always uses host assignment generation and never falls back to fallback or dynamic classification", async () => {
  const base = baseProcessDependencies();
  const hostGroups = [group({ id: "hg1", semanticKey: "ceremony", source: "host_defined", name: "Ceremony" })];
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-3", mode: "host_defined" }));
  // Deliberately few descriptors — below the dynamic floor — to prove the
  // mode check, not the count check, drives dispatch for host_defined.
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async (_eventId, source) => (source === "host_defined" ? hostGroups : []));
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  const generateHostDefined = spy<ProcessDep<"generateHostDefinedAssignments">>(
    async (): Promise<HighlightAssignment[]> => [{ groupId: "hg1", mediaId: "m1" }],
  );

  await processHighlightGeneration(
    "gen-3",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      generateHostDefinedAssignments: generateHostDefined,
    }),
  );

  assert.equal(generateHostDefined.calls.length, 1);
  assert.equal(base.classifyFallbackHighlights.calls.length, 0);
  assert.equal(base.generateDynamicHighlights.calls.length, 0);
  assert.equal(base.createMemoryHighlightGroup.calls.length, 0); // host groups pre-exist; the service never creates them
  assert.equal(publish.calls.length, 1);
});

test("one media item assigned into multiple groups produces multiple membership rows", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-4", mode: "fallback" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  let nextGroupId = 0;
  const createGroup = spy<ProcessDep<"createMemoryHighlightGroup">>(async (_eventId, input) => {
    nextGroupId += 1;
    return group({ id: `g${nextGroupId}`, semanticKey: input.semanticKey, name: input.name, description: input.description, source: input.source });
  });
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  const classifyFallback = spy<ProcessDep<"classifyFallbackHighlights">>((): HighlightProposal[] => [
    { semanticKey: "cake", name: "Cake", description: null, source: "fallback", mediaIds: ["m1"] },
    { semanticKey: "food-drinks", name: "Food & Drinks", description: null, source: "fallback", mediaIds: ["m1"] },
  ]);

  await processHighlightGeneration(
    "gen-4",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      createMemoryHighlightGroup: createGroup,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      classifyFallbackHighlights: classifyFallback,
    }),
  );

  assert.equal(replaceMemberships.calls.length, 1);
  const membershipsCall = replaceMemberships.calls[0];
  assert.ok(membershipsCall);
  const [, memberships] = membershipsCall;
  assert.equal(memberships.length, 2);
  assert.equal(memberships.filter((m) => m.mediaId === "m1").length, 2);
  assert.equal(new Set(memberships.map((m) => m.groupId)).size, 2);
  assert.equal(publish.calls.length, 1);
});

test("invalid or empty classifier output fails the generation and never publishes", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-5", mode: "fallback" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  const fail = spy<ProcessDep<"failHighlightGeneration">>(async () => {});
  const classifyFallback = spy<ProcessDep<"classifyFallbackHighlights">>((): HighlightProposal[] => []); // nothing matched any category

  await processHighlightGeneration(
    "gen-5",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      failHighlightGeneration: fail,
      classifyFallbackHighlights: classifyFallback,
    }),
  );

  assert.equal(base.publishHighlightGeneration.calls.length, 0);
  assert.equal(fail.calls.length, 1);
  const failCall = fail.calls[0];
  assert.ok(failCall);
  const [failEventId, failGenerationId, errorCode] = failCall;
  assert.equal(failEventId, "event-1");
  assert.equal(failGenerationId, "gen-5");
  assert.equal(typeof errorCode, "string");
  assert.ok(errorCode.length > 0);
});

test("a thrown provider error fails the generation without publishing, so the previously published generation is preserved", async () => {
  const base = baseProcessDependencies();
  const descriptors = Array.from({ length: 8 }, (_, index) => descriptor(`m${index + 1}`));
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-6", mode: "automatic" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => descriptors);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  const fail = spy<ProcessDep<"failHighlightGeneration">>(async () => {});
  const generateDynamic = spy<ProcessDep<"generateDynamicHighlights">>(async (): Promise<HighlightProposal[]> => {
    throw new Error("Anthropic request failed");
  });

  await processHighlightGeneration(
    "gen-6",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      failHighlightGeneration: fail,
      generateDynamicHighlights: generateDynamic,
    }),
  );

  // failHighlightGeneration is the sole mechanism that persists this outcome
  // and its own implementation never writes published_highlight_generation_id
  // (verified directly in repository.test.ts's contract test for it) — this
  // test only proves the service reaches fail(), never publish(), when the
  // provider rejects.
  assert.equal(base.publishHighlightGeneration.calls.length, 0);
  assert.equal(fail.calls.length, 1);
  const failCall = fail.calls[0];
  assert.ok(failCall);
  assert.equal(failCall[0], "event-1");
  assert.equal(failCall[1], "gen-6");
});

test("processing an already-claimed generation (e.g. already published) again is a no-op", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => null); // simulates: status is no longer 'queued'

  await processHighlightGeneration(
    "gen-already-done",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
    }),
  );

  assert.equal(claim.calls.length, 1);
  assert.equal(base.publishHighlightGeneration.calls.length, 0);
  assert.equal(base.failHighlightGeneration.calls.length, 0);
  assert.equal(base.listApprovedMemoryDescriptors.calls.length, 0);
});

// ---------------------------------------------------------------------------
// requestHighlightGeneration — queueing policy
// ---------------------------------------------------------------------------

function highlightState(overrides: Partial<HighlightGenerationState> = {}): HighlightGenerationState {
  return {
    highlightMode: "automatic",
    publishedGenerationId: null,
    pendingGenerationId: null,
    generationStatus: "idle",
    lastGeneratedMediaCount: 0,
    ...overrides,
  };
}

test("requestHighlightGeneration queues a fallback-mode generation when under the dynamic floor and nothing is pending", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () => highlightState());
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-new", eventId, mode }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  const result = await requestHighlightGeneration("event-1", false, deps);

  assert.ok(result);
  assert.equal(queue.calls.length, 1);
  assert.equal(queue.calls[0]?.[1], "fallback");
});

test("requestHighlightGeneration never queues a second generation while one is already pending, even when forced", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () =>
    highlightState({ generationStatus: "processing", pendingGenerationId: "gen-existing" }),
  );
  const listDescriptors = neverCalled<RequestDep<"listApprovedMemoryDescriptors">>("listApprovedMemoryDescriptors");
  const queue = neverCalled<RequestDep<"queueHighlightGeneration">>("queueHighlightGeneration");

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  const result = await requestHighlightGeneration("event-1", true, deps);

  assert.equal(result, null);
  assert.equal(queue.calls.length, 0);
});

test("requestHighlightGeneration force bypasses the 'not enough new media yet' policy check", async () => {
  // Already published once, at the same count as now — shouldQueueHighlightGeneration
  // alone would refuse (nothing new to justify a re-run), but force overrides that.
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () =>
    highlightState({ publishedGenerationId: "gen-old", lastGeneratedMediaCount: 3 }),
  );
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1"), descriptor("m2"), descriptor("m3")]);
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-forced", eventId, mode }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  const result = await requestHighlightGeneration("event-1", true, deps);

  assert.ok(result);
  assert.equal(queue.calls.length, 1);
});

// ---------------------------------------------------------------------------
// backfillMissingMemoryDescriptors
// ---------------------------------------------------------------------------

test("backfillMissingMemoryDescriptors detects labels and upserts a descriptor for each missing media item", async () => {
  const missing: MemoryMediaSummary[] = [
    { mediaId: "m1", eventId: "event-1", mediaKind: "photo", objectKeyDisplay: "display/event-1/m1.webp" },
    { mediaId: "m2", eventId: "event-1", mediaKind: "photo", objectKeyDisplay: "display/event-1/m2.webp" },
  ];
  const listMissing = spy<BackfillDep<"listApprovedMediaMissingDescriptors">>(async () => missing);
  const upsert = spy<BackfillDep<"upsertMemoryMediaDescriptor">>(async () => {});
  const detectLabels = spy<BackfillDep<"detectLabels">>(async (media) => [{ name: `label-for-${media.mediaId}`, confidence: 0.9 }]);

  const deps: BackfillMissingDescriptorsDependencies = {
    listApprovedMediaMissingDescriptors: listMissing.fn,
    upsertMemoryMediaDescriptor: upsert.fn,
    detectLabels: detectLabels.fn,
  };
  const count = await backfillMissingMemoryDescriptors("event-1", 10, deps);

  assert.equal(count, 2);
  assert.equal(upsert.calls.length, 2);
  assert.equal(upsert.calls[0]?.[0].mediaId, "m1");
  assert.deepEqual(upsert.calls[0]?.[0].labels, [{ name: "label-for-m1", confidence: 0.9 }]);
});

test("backfillMissingMemoryDescriptors is best-effort: one item's failure doesn't stop the batch", async () => {
  const missing: MemoryMediaSummary[] = [
    { mediaId: "m1", eventId: "event-1", mediaKind: "photo", objectKeyDisplay: "display/event-1/m1.webp" },
    { mediaId: "m2", eventId: "event-1", mediaKind: "photo", objectKeyDisplay: "display/event-1/m2.webp" },
  ];
  const listMissing = spy<BackfillDep<"listApprovedMediaMissingDescriptors">>(async () => missing);
  const upsert = spy<BackfillDep<"upsertMemoryMediaDescriptor">>(async () => {});
  const detectLabels = spy<BackfillDep<"detectLabels">>(async (media) => {
    if (media.mediaId === "m1") throw new Error("rekognition unavailable");
    return [{ name: "Cake", confidence: 0.9 }];
  });

  const deps: BackfillMissingDescriptorsDependencies = {
    listApprovedMediaMissingDescriptors: listMissing.fn,
    upsertMemoryMediaDescriptor: upsert.fn,
    detectLabels: detectLabels.fn,
  };
  const count = await backfillMissingMemoryDescriptors("event-1", 10, deps);

  assert.equal(count, 1);
  assert.equal(upsert.calls.length, 1);
  assert.equal(upsert.calls[0]?.[0].mediaId, "m2");
});

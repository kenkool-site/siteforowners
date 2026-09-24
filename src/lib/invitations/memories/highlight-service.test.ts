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
    // Descriptor-readiness wait: every existing scenario below has a
    // complete descriptor set already, so the default backfill is a no-op
    // (0 backfilled) and the default missing-descriptor check reports
    // nothing missing — proceeding straight through to classification exactly
    // as these tests expect. requeueHighlightGeneration stays neverCalled by
    // default since none of these scenarios should ever reach it.
    backfillMissingMemoryDescriptors: spy<ProcessDep<"backfillMissingMemoryDescriptors">>(async () => 0),
    listApprovedMediaMissingDescriptors: spy<ProcessDep<"listApprovedMediaMissingDescriptors">>(async () => []),
    requeueHighlightGeneration: neverCalled<ProcessDep<"requeueHighlightGeneration">>("requeueHighlightGeneration"),
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
    classifyIntoHostGroups: neverCalled<ProcessDep<"classifyIntoHostGroups">>("classifyIntoHostGroups"),
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

test("the media count passed to publish is the approved descriptor count, not the grouped/deduped assignment count", async () => {
  // Item 3 regression: requestHighlightGeneration compares the NEXT call's
  // approvedCount against this stored value to decide whether enough new
  // media has accumulated (REGENERATION_INTERVAL). If publish were given the
  // grouped-media count instead, a large gap between "approved" and "what
  // the model actually grouped" would defeat that cost/rate-limit guard.
  const base = baseProcessDependencies();
  const descriptors = Array.from({ length: 8 }, (_, index) => descriptor(`m${index + 1}`));
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-count", mode: "automatic" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => descriptors);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => []);
  const createGroup = spy<ProcessDep<"createMemoryHighlightGroup">>(async (_eventId, input) =>
    group({ id: "g-count", semanticKey: input.semanticKey, name: input.name, description: input.description, source: input.source }),
  );
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  // Only 3 of the 8 approved descriptors end up grouped — the model didn't
  // find a home for the other 5.
  const generateDynamic = spy<ProcessDep<"generateDynamicHighlights">>(async (): Promise<HighlightProposal[]> => [
    { semanticKey: "cake", name: "Cake", description: null, source: "ai_generated", mediaIds: ["m1", "m2", "m3"] },
  ]);

  await processHighlightGeneration(
    "gen-count",
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

  assert.equal(publish.calls.length, 1);
  const publishCall = publish.calls[0];
  assert.ok(publishCall);
  assert.equal(publishCall[2], 8); // descriptors.length, not the 3 distinct grouped media ids
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
  // No exact match this round — proves the AI path alone is enough to publish.
  const classifyExact = spy<ProcessDep<"classifyIntoHostGroups">>((): HighlightAssignment[] => []);
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
      classifyIntoHostGroups: classifyExact,
      generateHostDefinedAssignments: generateHostDefined,
    }),
  );

  assert.equal(classifyExact.calls.length, 1); // Task 2's exact-match pre-filter has a real caller
  assert.equal(generateHostDefined.calls.length, 1);
  assert.equal(base.classifyFallbackHighlights.calls.length, 0);
  assert.equal(base.generateDynamicHighlights.calls.length, 0);
  assert.equal(base.createMemoryHighlightGroup.calls.length, 0); // host groups pre-exist; the service never creates them
  assert.equal(publish.calls.length, 1);
});

test("host-defined mode merges Task 2's exact-match pre-filter output with the AI's, deduping overlapping (group, media) pairs", async () => {
  const base = baseProcessDependencies();
  const hostGroups = [
    group({ id: "hg1", semanticKey: "ceremony", source: "host_defined", name: "Ceremony" }),
    group({ id: "hg2", semanticKey: "reception", source: "host_defined", name: "Reception" }),
  ];
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-3b", mode: "host_defined" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1"), descriptor("m2")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => hostGroups);
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {});
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {});
  // The exact-match pass confidently resolves m1 into hg1. The AI pass
  // redundantly also proposes m1→hg1 (should collapse to one row) AND
  // independently proposes m2→hg2 (the exact pass never saw this one).
  const classifyExact = spy<ProcessDep<"classifyIntoHostGroups">>((): HighlightAssignment[] => [{ groupId: "hg1", mediaId: "m1" }]);
  const generateHostDefined = spy<ProcessDep<"generateHostDefinedAssignments">>(async (): Promise<HighlightAssignment[]> => [
    { groupId: "hg1", mediaId: "m1" },
    { groupId: "hg2", mediaId: "m2" },
  ]);

  await processHighlightGeneration(
    "gen-3b",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      classifyIntoHostGroups: classifyExact,
      generateHostDefinedAssignments: generateHostDefined,
    }),
  );

  assert.equal(replaceMemberships.calls.length, 1);
  const membershipsCall = replaceMemberships.calls[0];
  assert.ok(membershipsCall);
  const [, memberships] = membershipsCall;
  // 2 distinct pairs, not 3 — the duplicate m1→hg1 from both sources collapsed.
  assert.equal(memberships.length, 2);
  assert.ok(memberships.some((m) => m.groupId === "hg1" && m.mediaId === "m1"));
  assert.ok(memberships.some((m) => m.groupId === "hg2" && m.mediaId === "m2"));
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

test("an existing group's name/description are only refreshed after publish succeeds, and only after membership is written", async () => {
  // Item 2 regression: refreshing an existing group's copy before the run is
  // known to succeed would let a failed run's unpublished wording leak onto
  // an already guest-visible group. Assert both that the update happens, and
  // that it happens strictly after replaceMemberships/publish, using a
  // shared call-order tracker.
  const base = baseProcessDependencies();
  const callOrder: string[] = [];
  const existingGroups = [group({ id: "existing-cake", semanticKey: "cake", name: "Old Cake", description: "Old desc", source: "fallback" })];
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-defer", mode: "fallback" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => existingGroups);
  const updateGroup = spy<ProcessDep<"updateMemoryHighlightGroup">>(async () => {
    callOrder.push("updateGroup");
  });
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {
    callOrder.push("replaceMemberships");
  });
  const publish = spy<ProcessDep<"publishHighlightGeneration">>(async () => {
    callOrder.push("publish");
  });
  const classifyFallback = spy<ProcessDep<"classifyFallbackHighlights">>((): HighlightProposal[] => [
    { semanticKey: "cake", name: "New Cake", description: "New desc", source: "fallback", mediaIds: ["m1"] },
  ]);

  await processHighlightGeneration(
    "gen-defer",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      updateMemoryHighlightGroup: updateGroup,
      replaceHighlightGenerationMemberships: replaceMemberships,
      publishHighlightGeneration: publish,
      classifyFallbackHighlights: classifyFallback,
    }),
  );

  assert.equal(updateGroup.calls.length, 1);
  assert.deepEqual(callOrder, ["replaceMemberships", "publish", "updateGroup"]);
  const updateCall = updateGroup.calls[0];
  assert.ok(updateCall);
  assert.equal(updateCall[1], "existing-cake");
  assert.deepEqual(updateCall[2], { name: "New Cake", description: "New desc" });
});

test("a failure after group resolution never updates an existing group's name/description", async () => {
  // The other half of item 2: if replaceMemberships or publish throws, the
  // existing group's copy must be left exactly as it was — never touched.
  const base = baseProcessDependencies();
  const existingGroups = [group({ id: "existing-cake", semanticKey: "cake", name: "Old Cake", description: "Old desc", source: "fallback" })];
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-defer-fail", mode: "fallback" }));
  const listDescriptors = spy<ProcessDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const listGroups = spy<ProcessDep<"listMemoryHighlightGroups">>(async () => existingGroups);
  const replaceMemberships = spy<ProcessDep<"replaceHighlightGenerationMemberships">>(async () => {
    throw new Error("DB write failed");
  });
  const fail = spy<ProcessDep<"failHighlightGeneration">>(async () => {});
  const classifyFallback = spy<ProcessDep<"classifyFallbackHighlights">>((): HighlightProposal[] => [
    { semanticKey: "cake", name: "New Cake", description: "New desc", source: "fallback", mediaIds: ["m1"] },
  ]);

  await processHighlightGeneration(
    "gen-defer-fail",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMemoryDescriptors: listDescriptors,
      listMemoryHighlightGroups: listGroups,
      replaceHighlightGenerationMemberships: replaceMemberships,
      failHighlightGeneration: fail,
      classifyFallbackHighlights: classifyFallback,
    }),
  );

  assert.equal(base.updateMemoryHighlightGroup.calls.length, 0); // never called — base's copy is neverCalled, would throw if reached
  assert.equal(base.publishHighlightGeneration.calls.length, 0);
  assert.equal(fail.calls.length, 1);
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

test("a generation claimed with missing descriptors is re-queued rather than terminally failed with EMPTY_HIGHLIGHT_OUTPUT", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-missing", mode: "fallback" }));
  // Simulates a pre-existing/legacy event: zero descriptors exist yet, so
  // the per-event catch-up backfill runs but at least one approved item is
  // still missing a descriptor afterward (e.g. more were missing than the
  // bounded catch-up limit, or this specific item's extraction failed).
  const backfill = spy<ProcessDep<"backfillMissingMemoryDescriptors">>(async () => 0);
  const listMissing = spy<ProcessDep<"listApprovedMediaMissingDescriptors">>(async () => [
    { mediaId: "m1", eventId: "event-1", mediaKind: "photo" as const, objectKeyDisplay: null },
  ]);
  const requeue = spy<ProcessDep<"requeueHighlightGeneration">>(async () => true);

  await processHighlightGeneration(
    "gen-missing",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      backfillMissingMemoryDescriptors: backfill,
      listApprovedMediaMissingDescriptors: listMissing,
      requeueHighlightGeneration: requeue,
    }),
  );

  assert.equal(backfill.calls.length, 1);
  assert.equal(backfill.calls[0]?.[0], "event-1");
  assert.equal(listMissing.calls.length, 1);
  assert.equal(requeue.calls.length, 1);
  assert.deepEqual(requeue.calls[0], ["event-1", "gen-missing"]);
  // The whole point: never runs the classifier or fails the generation just
  // because descriptors aren't ready yet.
  assert.equal(base.listApprovedMemoryDescriptors.calls.length, 0);
  assert.equal(base.classifyFallbackHighlights.calls.length, 0);
  assert.equal(base.generateDynamicHighlights.calls.length, 0);
  assert.equal(base.failHighlightGeneration.calls.length, 0);
  assert.equal(base.publishHighlightGeneration.calls.length, 0);
});

test("host-defined mode also waits for descriptors to be ready before classifying", async () => {
  const base = baseProcessDependencies();
  const claim = spy<ProcessDep<"claimNextHighlightGeneration">>(async () => generation({ id: "gen-host-missing", mode: "host_defined" }));
  const listMissing = spy<ProcessDep<"listApprovedMediaMissingDescriptors">>(async () => [
    { mediaId: "m1", eventId: "event-1", mediaKind: "photo" as const, objectKeyDisplay: null },
  ]);
  const requeue = spy<ProcessDep<"requeueHighlightGeneration">>(async () => true);

  await processHighlightGeneration(
    "gen-host-missing",
    toDeps({
      ...base,
      claimNextHighlightGeneration: claim,
      listApprovedMediaMissingDescriptors: listMissing,
      requeueHighlightGeneration: requeue,
    }),
  );

  assert.equal(requeue.calls.length, 1);
  assert.equal(base.listMemoryHighlightGroups.calls.length, 0);
  assert.equal(base.generateHostDefinedAssignments.calls.length, 0);
  assert.equal(base.classifyIntoHostGroups.calls.length, 0);
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
    generationError: null,
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

test("requestHighlightGeneration never queues a second generation while one is already pending (not yet stale), even when forced", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () =>
    highlightState({ generationStatus: "processing", pendingGenerationId: "gen-existing" }),
  );
  const listDescriptors = neverCalled<RequestDep<"listApprovedMemoryDescriptors">>("listApprovedMemoryDescriptors");
  const queue = neverCalled<RequestDep<"queueHighlightGeneration">>("queueHighlightGeneration");
  // Not yet past the staleness threshold — still legitimately in-flight.
  const reclaimStale = spy<RequestDep<"reclaimStaleHighlightGeneration">>(async () => null);

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
    reclaimStaleHighlightGeneration: reclaimStale.fn,
  };
  const result = await requestHighlightGeneration("event-1", true, deps);

  assert.equal(result, null);
  assert.equal(reclaimStale.calls.length, 1);
  assert.equal(queue.calls.length, 0);
});

test("requestHighlightGeneration reclaims a stale stuck-processing generation and queues a fresh attempt", async () => {
  // Item 4: a generation that died mid-run (e.g. a function timeout) must not
  // permanently block the event from ever queuing again.
  let callCount = 0;
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () => {
    callCount += 1;
    // First read: still shows the stuck generation. After a successful
    // reclaim, the event row has been reset — second read shows idle.
    return callCount === 1
      ? highlightState({ generationStatus: "processing", pendingGenerationId: "gen-stuck" })
      : highlightState({ generationStatus: "idle" });
  });
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(async () => [descriptor("m1")]);
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-fresh", eventId, mode }));
  const reclaimStale = spy<RequestDep<"reclaimStaleHighlightGeneration">>(async () => generation({ id: "gen-stuck", mode: "fallback", status: "failed" }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
    reclaimStaleHighlightGeneration: reclaimStale.fn,
  };
  const result = await requestHighlightGeneration("event-1", false, deps);

  assert.equal(reclaimStale.calls.length, 1);
  assert.equal(reclaimStale.calls[0]?.[0], "gen-stuck");
  assert.equal(getState.calls.length, 2); // state re-read after a successful reclaim
  assert.ok(result);
  assert.equal(queue.calls.length, 1);
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

test("requestHighlightGeneration selects fallback mode at exactly 7 approved descriptors (just under the dynamic floor)", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () => highlightState());
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(
    async () => Array.from({ length: 7 }, (_, index) => descriptor(`m${index + 1}`)),
  );
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-7", eventId, mode }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  await requestHighlightGeneration("event-1", false, deps);

  assert.equal(queue.calls[0]?.[1], "fallback");
});

test("requestHighlightGeneration selects automatic (dynamic) mode at exactly 8 approved descriptors (the dynamic floor)", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () => highlightState());
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(
    async () => Array.from({ length: 8 }, (_, index) => descriptor(`m${index + 1}`)),
  );
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-8", eventId, mode }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  await requestHighlightGeneration("event-1", false, deps);

  assert.equal(queue.calls[0]?.[1], "automatic");
});

test("requestHighlightGeneration selects host_defined mode whenever the event's highlightMode is host_defined, regardless of descriptor count", async () => {
  const getState = spy<RequestDep<"getHighlightGenerationState">>(async () => highlightState({ highlightMode: "host_defined" }));
  // Deliberately at/above the dynamic floor — proves the event's highlightMode
  // wins over the count-based fallback/automatic split.
  const listDescriptors = spy<RequestDep<"listApprovedMemoryDescriptors">>(
    async () => Array.from({ length: 20 }, (_, index) => descriptor(`m${index + 1}`)),
  );
  const queue = spy<RequestDep<"queueHighlightGeneration">>(async (eventId, mode) => generation({ id: "gen-host", eventId, mode }));

  const deps: RequestHighlightGenerationDependencies = {
    getHighlightGenerationState: getState.fn,
    listApprovedMemoryDescriptors: listDescriptors.fn,
    queueHighlightGeneration: queue.fn,
  };
  await requestHighlightGeneration("event-1", false, deps);

  assert.equal(queue.calls[0]?.[1], "host_defined");
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

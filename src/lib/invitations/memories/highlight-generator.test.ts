// src/lib/invitations/memories/highlight-generator.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { generateDynamicHighlights, generateHostDefinedAssignments } from "./highlight-generator";
import type { MemoryHighlightGroup, MemoryMediaDescriptor } from "./highlight-types";

function descriptor(overrides: Partial<MemoryMediaDescriptor> & { mediaId: string }): MemoryMediaDescriptor {
  return {
    mediaKind: "photo",
    labels: [],
    ...overrides,
  };
}

function hostGroup(overrides: Partial<MemoryHighlightGroup> & { id: string }): MemoryHighlightGroup {
  return {
    eventId: "event-1",
    name: "Untitled",
    description: null,
    semanticKey: "untitled",
    source: "host_defined",
    sortOrder: 0,
    isVisible: true,
    ...overrides,
  };
}

const descriptors: MemoryMediaDescriptor[] = [
  descriptor({ mediaId: "m1", labels: [{ name: "Cake", confidence: 0.9 }] }),
  descriptor({ mediaId: "m2", labels: [{ name: "Icing", confidence: 0.8 }] }),
  descriptor({ mediaId: "m3", labels: [{ name: "Portrait", confidence: 0.8 }] }),
  descriptor({ mediaId: "m4", labels: [{ name: "Dance Floor", confidence: 0.85 }] }),
  descriptor({ mediaId: "m5", labels: [{ name: "DJ", confidence: 0.7 }] }),
  descriptor({ mediaId: "m6", labels: [{ name: "Floral", confidence: 0.75 }] }),
  descriptor({ mediaId: "m7", labels: [{ name: "Centerpiece", confidence: 0.75 }] }),
  descriptor({ mediaId: "m8", labels: [{ name: "Balloon", confidence: 0.7 }] }),
];

test("generateDynamicHighlights returns groups with multi-membership when the AI assigns a photo to more than one group", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: "The cake celebration", mediaIds: ["m1", "m2"] },
            { semanticKey: "family", name: "Family & Friends", description: "Group portraits", mediaIds: ["m1", "m3"] },
            { semanticKey: "dancing", name: "Dancing", description: "Reception dance floor", mediaIds: ["m4", "m5"] },
            { semanticKey: "decorations", name: "Decorations", description: "Florals and table styling", mediaIds: ["m6", "m7", "m8"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.equal(proposals.filter((group) => group.mediaIds.includes("m1")).length, 2);
});

test("generateDynamicHighlights excludes media ids the AI invents that were never in the descriptor list", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1", "unknown-media-id"] },
            { semanticKey: "family", name: "Family & Friends", description: null, mediaIds: ["m3"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m4", "m5"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m6", "m7", "m8"] },
          ],
        }),
    },
  );

  const cakeGroup = proposals.find((group) => group.semanticKey === "cake-cutting");
  assert.ok(cakeGroup);
  assert.deepEqual(cakeGroup!.mediaIds, ["m1"]);
  assert.ok(!proposals.some((group) => group.mediaIds.includes("unknown-media-id")));
});

test("generateDynamicHighlights merges groups the AI returns under the same semantic key", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "Cake-Cutting", name: "Cake Cutting", description: null, mediaIds: ["m2"] },
            { semanticKey: "family", name: "Family & Friends", description: null, mediaIds: ["m3"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m4", "m5"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m6", "m7", "m8"] },
          ],
        }),
    },
  );

  const cakeGroups = proposals.filter((group) => group.semanticKey.toLowerCase() === "cake-cutting");
  assert.equal(cakeGroups.length, 1);
  assert.deepEqual(cakeGroups[0].mediaIds.sort(), ["m1", "m2"]);
  assert.equal(proposals.length, 4);
});

test("generateDynamicHighlights drops a group whose name or key infers a protected or personal trait", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "family", name: "Family & Friends", description: null, mediaIds: ["m3"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m4", "m5"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m6", "m7"] },
            { semanticKey: "elderly-guests", name: "Elderly Guests", description: "Older attendees", mediaIds: ["m8"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => group.semanticKey === "elderly-guests"));
  assert.ok(!proposals.some((group) => /elderly/i.test(group.name)));
});

test("generateDynamicHighlights rejects when the AI response contains no parsable JSON object", async () => {
  await assert.rejects(
    generateDynamicHighlights(
      { descriptors, existingGroups: [] },
      { generateText: async () => "I'm sorry, I can't help with that." },
    ),
  );
});

test("generateDynamicHighlights preserves an existing group's semantic key and host-edited name when the semantic key matches", async () => {
  const existingGroups: MemoryHighlightGroup[] = [
    hostGroup({
      id: "existing-1",
      semanticKey: "cake-cutting",
      name: "The Big Cake Moment",
      description: "Host-edited name",
      source: "ai_generated",
    }),
  ];

  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: "Fresh AI description", mediaIds: ["m1"] },
            { semanticKey: "family", name: "Family & Friends", description: null, mediaIds: ["m3"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m4", "m5"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m6", "m7", "m8"] },
          ],
        }),
    },
  );

  const cakeGroup = proposals.find((group) => group.semanticKey === "cake-cutting");
  assert.ok(cakeGroup);
  assert.equal(cakeGroup!.name, "The Big Cake Moment");
});

test("generateHostDefinedAssignments includes each host group's name and description in the prompt sent to the model", async () => {
  const groups: MemoryHighlightGroup[] = [
    hostGroup({ id: "g1", name: "Golden Hour", description: "Sunset portraits by the lake", semanticKey: "golden-hour" }),
    hostGroup({ id: "g2", name: "First Dance", description: null, semanticKey: "first-dance" }),
  ];

  let capturedPrompt = "";
  await generateHostDefinedAssignments(
    { descriptors, groups },
    {
      generateText: async ({ prompt }) => {
        capturedPrompt = prompt;
        return JSON.stringify({ assignments: [] });
      },
    },
  );

  assert.ok(capturedPrompt.includes("Golden Hour"));
  assert.ok(capturedPrompt.includes("Sunset portraits by the lake"));
  assert.ok(capturedPrompt.includes("First Dance"));
});

test("generateHostDefinedAssignments accepts only known group and media ids and permits multiple groups per photo", async () => {
  const groups: MemoryHighlightGroup[] = [
    hostGroup({ id: "g1", name: "Golden Hour", semanticKey: "golden-hour" }),
    hostGroup({ id: "g2", name: "First Dance", semanticKey: "first-dance" }),
  ];

  const assignments = await generateHostDefinedAssignments(
    { descriptors, groups },
    {
      generateText: async () =>
        JSON.stringify({
          assignments: [
            { groupId: "g1", mediaIds: ["m1", "unknown-media"] },
            { groupId: "g2", mediaIds: ["m1"] },
            { groupId: "unknown-group", mediaIds: ["m2"] },
          ],
        }),
    },
  );

  const sortKey = (a: { groupId: string; mediaId: string }) => `${a.groupId}:${a.mediaId}`;
  assert.deepEqual(
    [...assignments].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [
      { groupId: "g1", mediaId: "m1" },
      { groupId: "g2", mediaId: "m1" },
    ],
  );
});

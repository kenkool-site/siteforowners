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

function normalizeForTest(value: string): string {
  return value.trim().toLowerCase();
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
    /JSON/,
  );
});

test("generateDynamicHighlights rejects when fewer than 4 valid groups survive", async () => {
  await assert.rejects(
    generateDynamicHighlights(
      { descriptors, existingGroups: [] },
      {
        generateText: async () =>
          JSON.stringify({
            groups: [
              { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
              { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
              { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            ],
          }),
      },
    ),
    /valid group/,
  );
});

test("generateDynamicHighlights rejects when more than 8 valid groups are returned", async () => {
  await assert.rejects(
    generateDynamicHighlights(
      { descriptors, existingGroups: [] },
      {
        generateText: async () =>
          JSON.stringify({
            groups: Array.from({ length: 9 }, (_, i) => ({
              semanticKey: `group-${i}`,
              name: `Group ${i}`,
              description: null,
              mediaIds: ["m1"],
            })),
          }),
      },
    ),
    /valid group/,
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

test("generateDynamicHighlights drops English ethnicity/nationality and age category names beyond the original short list", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            { semanticKey: "asian-guests", name: "Asian Guests", description: null, mediaIds: ["m5"] },
            { semanticKey: "senior-guests", name: "Senior Guests", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /asian|senior/i.test(group.name)));
});

test("generateDynamicHighlights drops black/white guest-grouping phrases but keeps legitimate 'Black Tie' and 'Black and White' names", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "black-tie", name: "Black Tie", description: null, mediaIds: ["m3"] },
            { semanticKey: "black-and-white", name: "Black and White", description: null, mediaIds: ["m4"] },
            { semanticKey: "black-guests", name: "Black Guests", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => group.name === "Black Guests"));
  assert.ok(proposals.some((group) => group.name === "Black Tie"));
  assert.ok(proposals.some((group) => group.name === "Black and White"));
});

test("generateDynamicHighlights drops Spanish-language denylisted category names when adjacent to a people noun (raza, invitados mayores, discapacidad)", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            // "raza" is an always-bare concept word (no adjacency needed).
            { semanticKey: "raza", name: "Invitados por Raza", description: null, mediaIds: ["m5"] },
            // "mayores" (age) is adjacency-gated; "invitados" (guests) right
            // next to it is what makes this unsafe - see the companion test
            // below proving the disconnected form ("Fotos de los Mayores")
            // is a disclosed residual limitation that now survives instead.
            { semanticKey: "mayores", name: "Invitados Mayores", description: null, mediaIds: ["m6"] },
            // "discapacidad" (disability) adjacent to "invitados" with one
            // connector word ("con") in between - within the adjacency window.
            { semanticKey: "discapacidad", name: "Invitados con Discapacidad", description: null, mediaIds: ["m7"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /raza|mayores|discapacidad/i.test(group.name)));
});

test("generateDynamicHighlights drops an accented Spanish denylisted term after Unicode normalization, even when only the name carries it (Religión)", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            // semanticKey is deliberately religion-free ("faith-group") so a
            // pass here can only be explained by the NAME field's accented
            // "Religión" normalizing to "religion" and matching adjacent to
            // "Invitados" (guests) two tokens away.
            { semanticKey: "faith-group", name: "Invitados por Religión", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /religion/i.test(group.name)));
});

test("generateDynamicHighlights detects a people-adjacent denylisted term even when only the (accented) semantic key carries it", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            // The name alone ("Wedding Celebration") is entirely innocuous -
            // only the accented Spanish key ("invitados-asiáticos") carries
            // the denylisted pattern. This fails under a slugify that deletes
            // accented characters instead of transliterating them (an
            // unaccented "invitados-asiticos" would not match "asiaticos").
            { semanticKey: "invitados-asiáticos", name: "Wedding Celebration", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => group.name === "Wedding Celebration"));
});

test("generateDynamicHighlights drops Spanish plural/grammatical variants adjacent to a people noun (Musulmanes, Judíos)", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            { semanticKey: "muslim-guests", name: "Invitados Musulmanes", description: null, mediaIds: ["m5"] },
            { semanticKey: "jewish-guests", name: "Invitados Judíos", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /musulman|judio/i.test(group.name)));
});

test("generateDynamicHighlights drops demonyms it never explicitly enumerated, in both languages, only when adjacent to a people noun", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            { semanticKey: "nigerian-guests", name: "Nigerian Guests", description: null, mediaIds: ["m5"] },
            { semanticKey: "dominican-family", name: "Familia Dominicana", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /nigerian|dominican/i.test(group.name)));
});

test("generateDynamicHighlights keeps legitimate nationality/religion/age-referencing category names that are not adjacent to a people noun", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "chinese-tea-ceremony", name: "Chinese Tea Ceremony", description: null, mediaIds: ["m1"] },
            { semanticKey: "korean-paebaek", name: "Korean Paebaek Ceremony", description: null, mediaIds: ["m2"] },
            { semanticKey: "mexican-folk-dance", name: "Mexican Folk Dance", description: null, mediaIds: ["m3"] },
            { semanticKey: "misa-catolica", name: "La Misa Católica", description: null, mediaIds: ["m4"] },
            { semanticKey: "senior-moments", name: "Senior Moments", description: null, mediaIds: ["m5"] },
            { semanticKey: "fine-china", name: "Fine China and Table Settings", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 6);
  assert.deepEqual(
    proposals.map((group) => group.name).sort(),
    [
      "Chinese Tea Ceremony",
      "Fine China and Table Settings",
      "Korean Paebaek Ceremony",
      "La Misa Católica",
      "Mexican Folk Dance",
      "Senior Moments",
    ],
  );
});

test("generateDynamicHighlights drops the bare noun 'Religion'/'Religión' with no adjacency required, but still allows the adjective 'Religious'/'Religiosa'", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            // The bare noun has no innocent standalone use as a group name -
            // unlike "Catholic"/"Religious", there is no "Religion Ceremony"
            // idiom, so this is bare-word matched with no adjacency needed.
            { semanticKey: "faith-en", name: "Religion", description: null, mediaIds: ["m1"] },
            { semanticKey: "faith-es", name: "Religión", description: null, mediaIds: ["m2"] },
            // The adjective form stays adjacency-gated and must still survive.
            { semanticKey: "religious-ceremony", name: "Religious Ceremony", description: null, mediaIds: ["m3"] },
            { semanticKey: "ceremonia-religiosa", name: "Ceremonia Religiosa", description: null, mediaIds: ["m4"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m5"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => group.name === "Religion" || group.name === "Religión"));
  assert.ok(proposals.some((group) => group.name === "Religious Ceremony"));
  assert.ok(proposals.some((group) => group.name === "Ceremonia Religiosa"));
});

test("generateDynamicHighlights checks semanticKey, name, and description independently - a term at the end of one field is never treated as adjacent to a term at the start of another", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            // These 4 are the review's exact cross-field reproductions - each
            // combination of fields, joined naively, would create a
            // "<word> <demographic/people-noun>" collision across the field
            // boundary that has nothing to do with the real content.
            {
              semanticKey: "family-portraits",
              name: "Family Portraits",
              description: "Chinese tea ceremony and multigenerational groupings",
              mediaIds: ["m3"],
            },
            {
              semanticKey: "guest-arrivals",
              name: "Guest Arrivals",
              description: "Korean hanbok and welcome drinks",
              mediaIds: ["m4"],
            },
            {
              semanticKey: "los-invitados",
              name: "Los Invitados",
              description: "Misa católica y recepción",
              mediaIds: ["m5"],
            },
            { semanticKey: "guest-book", name: "Catholic Mass", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 6);
  assert.deepEqual(
    proposals.map((group) => group.name).sort(),
    ["Cake Cutting", "Catholic Mass", "Dancing", "Family Portraits", "Guest Arrivals", "Los Invitados"],
  );
});

test("generateDynamicHighlights succeeds end-to-end on an ordinary Korean-wedding payload that previously threw due to the cross-field bug", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "ceremony", name: "Ceremony", description: "The wedding ceremony", mediaIds: ["m1"] },
            { semanticKey: "reception", name: "Reception", description: "Dinner and toasts", mediaIds: ["m2"] },
            {
              semanticKey: "dance-floor",
              name: "Dance Floor",
              description: "First dance and open dancing",
              mediaIds: ["m3"],
            },
            {
              semanticKey: "guest-portraits",
              name: "Guest Portraits",
              description: "Korean hanbok and family groupings",
              mediaIds: ["m4"],
            },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(proposals.some((group) => group.name === "Guest Portraits"));
});

test("generateDynamicHighlights drops Spanish equivalents of the existing English denylisted phrases (orientacion sexual, color de piel)", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            { semanticKey: "orientation-group", name: "Orientación Sexual de los Invitados", description: null, mediaIds: ["m5"] },
            { semanticKey: "skin-color-group", name: "Fotos por Color de Piel", description: null, mediaIds: ["m6"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 4);
  assert.ok(!proposals.some((group) => /orientacion|color de piel/i.test(group.name)));
});

test("generateDynamicHighlights allows 'Straight from the Heart' to survive now that 'straight' is adjacency-gated, not a bare word", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake-cutting", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
            { semanticKey: "straight-from-heart", name: "Straight from the Heart", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  assert.equal(proposals.length, 5);
  assert.ok(proposals.some((group) => group.name === "Straight from the Heart"));
});

test("generateDynamicHighlights canonicalizes semantic keys so casing/punctuation variants of the same key merge under one slug", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            // Different display names on purpose - if these merge, it must
            // be because their semantic keys slugify to the same value
            // ("cake-cutting"), not because of the name-distinctness pass.
            { semanticKey: "Cake Cutting!!", name: "Cake Time", description: null, mediaIds: ["m1"] },
            { semanticKey: "cake-cutting", name: "Cake O'Clock", description: null, mediaIds: ["m2"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m3"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m4"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  const cakeGroups = proposals.filter((group) => group.semanticKey === "cake-cutting");
  assert.equal(cakeGroups.length, 1);
  assert.deepEqual(cakeGroups[0].mediaIds.sort(), ["m1", "m2"]);
  assert.equal(proposals.length, 4);
});

test("generateDynamicHighlights treats underscores as a separator so 'CAKE_CUTTING' merges with 'cake-cutting'", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "CAKE_CUTTING", name: "Cake Alpha", description: null, mediaIds: ["m1"] },
            { semanticKey: "cake-cutting", name: "Cake Beta", description: null, mediaIds: ["m2"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m3"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m4"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  const cakeGroups = proposals.filter((group) => group.semanticKey === "cake-cutting");
  assert.equal(cakeGroups.length, 1);
  assert.deepEqual(cakeGroups[0].mediaIds.sort(), ["m1", "m2"]);
  assert.equal(proposals.length, 4);
});

test("generateDynamicHighlights reuses an existing group's semantic key verbatim (not re-slugified) when strong-matched by name", async () => {
  const existingGroups: MemoryHighlightGroup[] = [
    hostGroup({
      id: "existing-1",
      // A persisted key that predates this fix / uses its own convention -
      // re-slugifying it (even with the corrected slugify) would turn this
      // into "cake-cutting", which would no longer equal the persisted row.
      semanticKey: "cake_cutting",
      name: "Cake Cutting",
      source: "ai_generated",
    }),
  ];

  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            // Different key than the existing group's - strong match must
            // come from the name equality branch, not the key branch.
            { semanticKey: "cake-cutting-fresh", name: "Cake Cutting", description: null, mediaIds: ["m1"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m2"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m3"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m4"] },
          ],
        }),
    },
  );

  const cakeGroup = proposals.find((group) => group.name === "Cake Cutting");
  assert.ok(cakeGroup);
  assert.equal(cakeGroup!.semanticKey, "cake_cutting");
});

test("generateDynamicHighlights merges two groups with different semantic keys but the same normalized display name", async () => {
  const proposals = await generateDynamicHighlights(
    { descriptors, existingGroups: [] },
    {
      generateText: async () =>
        JSON.stringify({
          groups: [
            { semanticKey: "cake", name: "Cake", description: null, mediaIds: ["m1"] },
            { semanticKey: "the-cake", name: "  cake  ", description: null, mediaIds: ["m2"] },
            { semanticKey: "dancing", name: "Dancing", description: null, mediaIds: ["m3"] },
            { semanticKey: "decorations", name: "Decorations", description: null, mediaIds: ["m4"] },
            { semanticKey: "gifts", name: "Gifts", description: null, mediaIds: ["m5"] },
          ],
        }),
    },
  );

  const cakeGroups = proposals.filter((group) => normalizeForTest(group.name) === "cake");
  assert.equal(cakeGroups.length, 1);
  assert.deepEqual(cakeGroups[0].mediaIds.sort(), ["m1", "m2"]);
  assert.equal(proposals.length, 4);
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

test("generateHostDefinedAssignments returns immediately with no groups and never calls generateText (skips the guaranteed-empty Anthropic call)", async () => {
  let called = false;
  const assignments = await generateHostDefinedAssignments(
    { descriptors, groups: [] },
    {
      generateText: async () => {
        called = true;
        return JSON.stringify({ assignments: [] });
      },
    },
  );

  assert.deepEqual(assignments, []);
  assert.equal(called, false, "generateText must never be invoked when there are zero host-defined groups");
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

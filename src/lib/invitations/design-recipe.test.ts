import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_INVITATION_DESIGN_RECIPE,
  ensureReadableRecipe,
  normalizeInvitationDesignRecipe,
} from "./design-recipe";

const validRecipe = {
  version: 1,
  palette: { background: "#f8f4ea", surface: "#ffffff", text: "#173927", mutedText: "#536459", accent: "#b58a55", overlay: "#10251a" },
  typography: { display: "formal-script", body: "humanist-sans", weight: 500, tracking: 0.01, scale: "dramatic" },
  composition: { family: "framed", alignment: "center", maxWidth: 760, rhythm: "airy", heroTextPlacement: "center" },
  frame: { style: "botanical", width: 2, radius: "none", inset: true },
  decoration: { motif: "botanical", density: "rich", symmetry: "mirrored", divider: "flourish" },
  hero: { overlayStrength: 0.42, textColor: "#ffffff", focalX: 0.5, focalY: 0.4, minHeightVh: 100 },
  contentOrder: ["intro", "details", "intro", "gallery", "rsvp"],
};

test("normalizes an allowlisted recipe and removes duplicate content sections", () => {
  const result = normalizeInvitationDesignRecipe(validRecipe);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.contentOrder, ["intro", "details", "gallery", "rsvp"]);
  assert.equal(result.value.palette.background, "#F8F4EA");
});

test("rejects arbitrary presentation values and invalid colors", () => {
  assert.equal(normalizeInvitationDesignRecipe({ ...validRecipe, typography: { ...validRecipe.typography, display: "url(https://evil.test/font.woff)" } }).ok, false);
  assert.equal(normalizeInvitationDesignRecipe({ ...validRecipe, palette: { ...validRecipe.palette, accent: "red" } }).ok, false);
});

test("bounds numeric controls and rejects unknown versions", () => {
  const result = normalizeInvitationDesignRecipe({
    ...validRecipe,
    composition: { ...validRecipe.composition, maxWidth: 9000 },
    frame: { ...validRecipe.frame, width: -4 },
    hero: { ...validRecipe.hero, overlayStrength: 2, focalX: -1, minHeightVh: 20 },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.composition.maxWidth, 1120);
  assert.equal(result.value.frame.width, 0);
  assert.equal(result.value.hero.overlayStrength, 0.8);
  assert.equal(result.value.hero.focalX, 0);
  assert.equal(result.value.hero.minHeightVh, 80);
  assert.equal(normalizeInvitationDesignRecipe({ ...validRecipe, version: 2 }).ok, false);
});

test("repairs unreadable body and hero text contrast", () => {
  const recipe = structuredClone(DEFAULT_INVITATION_DESIGN_RECIPE);
  recipe.palette.background = "#FFFFFF";
  recipe.palette.text = "#FDFDFD";
  recipe.hero.textColor = "#111111";
  recipe.palette.overlay = "#111111";
  const readable = ensureReadableRecipe(recipe);
  assert.equal(readable.palette.text, "#111111");
  assert.equal(readable.hero.textColor, "#FFFFFF");
});

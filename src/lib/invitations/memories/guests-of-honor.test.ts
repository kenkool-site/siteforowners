import assert from "node:assert/strict";
import test from "node:test";
import { honorMatchIsLocked } from "./honor-repository";
import {
  buildHonorReview,
  buildPublicHonor,
  consentAudience,
  findCta,
  honorGroupPresentation,
  honorProfileForEventType,
  photoLabel,
  publicHonorLeaksPrivateFields,
  suggestRoleKeys,
  validateHonorConfirmation,
  type HonorMediaRef,
  type HonorPerson,
} from "./guests-of-honor";

const mercy: HonorPerson = { id: "h1", name: "Mercy", roleKey: "bride", selected: true };
const john: HonorPerson = { id: "h2", name: "John", roleKey: "groom", selected: true };
const stray: HonorPerson = { id: "h3", name: "Sam", roleKey: "bride", selected: false };

test("an excluded match is locked so a later upload match cannot put it back", () => {
  assert.equal(honorMatchIsLocked(true), true);
  assert.equal(honorMatchIsLocked(false), false);
  assert.equal(honorMatchIsLocked(null), false);
});

test("wedding profile is two roles and a fixed couple group, and is not the fallback for other events", () => {
  const wedding = honorProfileForEventType("Wedding");
  assert.equal(wedding.kind, "wedding");
  assert.equal(wedding.typicalCount, 2);
  assert.deepEqual(wedding.roles, ["bride", "groom"]);
  assert.equal(honorProfileForEventType("boda").kind, "wedding");
  assert.equal(honorProfileForEventType("quince").kind, "other");
  assert.notEqual(honorProfileForEventType("birthday").group, "the_couple");
});

test("role labels and group names follow the event-type table", () => {
  assert.deepEqual(honorProfileForEventType("birthday").roles, ["birthday_star"]);
  assert.equal(honorProfileForEventType("birthday").typicalCount, 1);
  assert.deepEqual(honorProfileForEventType("cumpleaños").roles, ["birthday_star"]);
  assert.deepEqual(honorProfileForEventType("anniversary").roles, ["couple"]);
  assert.equal(honorProfileForEventType("aniversario").group, "the_couple");
  assert.deepEqual(honorProfileForEventType("graduation").roles, ["graduate"]);
  assert.equal(honorProfileForEventType("corporate").typicalCount, null);
  assert.deepEqual(honorProfileForEventType("conference").roles, ["honoree", "speaker"]);

  const couple = honorGroupPresentation(honorProfileForEventType("wedding"), [mercy, john]);
  assert.equal(couple.fixedKey, "theCouple");
  assert.equal(couple.chipFixedKey, "theCouple");
  assert.equal(couple.subtitleSubject, "Mercy & John");

  const amara: HonorPerson = { id: "a", name: "Amara", roleKey: "birthday_star", selected: true };
  const birthday = honorGroupPresentation(honorProfileForEventType("birthday"), [amara]);
  assert.equal(birthday.name, "Amara");
  assert.equal(birthday.chipName, "Amara");
  assert.equal(birthday.fixedKey, null);
  assert.equal(birthday.badgeKey, "birthdayStar");
  assert.equal(birthday.subtitleKind, "birthdayStar");

  const graduate = honorGroupPresentation(honorProfileForEventType("graduation"), [
    { id: "g", name: "Luis", roleKey: "graduate", selected: true },
  ]);
  assert.equal(graduate.name, "Luis");
  const unnamed = honorGroupPresentation(honorProfileForEventType("graduation"), []);
  assert.equal(unnamed.fixedKey, "theGraduate");

  const speakers = honorGroupPresentation(honorProfileForEventType("corporate"), [
    { id: "c1", name: "Ada", roleKey: "honoree", selected: true },
    { id: "c2", name: "Grace", roleKey: "speaker", selected: true },
  ]);
  assert.equal(speakers.fixedKey, "theHonorees");
  assert.notEqual(speakers.fixedKey, "theCouple");
});

test("suggests roles in order and repeats the last role when a photo has extra faces", () => {
  assert.deepEqual(suggestRoleKeys(honorProfileForEventType("wedding"), 3), ["bride", "groom", "groom"]);
  assert.deepEqual(suggestRoleKeys(honorProfileForEventType("birthday"), 3), ["birthday_star", "birthday_star", "birthday_star"]);
});

test("confirmation requires consent and a name for every face that stays tagged", () => {
  const profile = honorProfileForEventType("wedding");
  const faces = [
    { index: 0, name: "Mercy", roleKey: "bride", selected: true },
    { index: 1, name: "John", roleKey: "groom", selected: true },
  ];
  assert.equal(validateHonorConfirmation(profile, faces, false).ok, false);
  assert.equal(validateHonorConfirmation(profile, [{ ...faces[0], name: "  " }, faces[1]], true).ok, false);
  assert.equal(validateHonorConfirmation(profile, faces.map((face) => ({ ...face, selected: false })), true).ok, false);
  assert.equal(validateHonorConfirmation(profile, [{ ...faces[0], roleKey: "speaker" }], true).ok, false);
  const ok = validateHonorConfirmation(profile, faces, true);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(consentAudience(ok.selected.map((face) => face.name)), { mode: "two", names: ["Mercy", "John"] });
});

test("a deselected stray face is left out of consent, labels, counts, and the public group", () => {
  const profile = honorProfileForEventType("birthday");
  const amara: HonorPerson = { id: "a", name: "Amara", roleKey: "birthday_star", selected: true };
  const extra: HonorPerson = { id: "x", name: "", roleKey: "birthday_star", selected: false };
  const other: HonorPerson = { id: "y", name: "Cousin", roleKey: "birthday_star", selected: false };
  const validated = validateHonorConfirmation(profile, [
    { index: 0, name: "Amara", roleKey: "birthday_star", selected: true },
    { index: 1, name: "", roleKey: "birthday_star", selected: false },
    { index: 2, name: "Cousin", roleKey: "birthday_star", selected: false },
  ], true);
  assert.equal(validated.ok, true);
  if (validated.ok) {
    assert.deepEqual(consentAudience(validated.selected.map((face) => face.name)).names, ["Amara"]);
    assert.equal(findCta(validated.selected.map((face) => face.name)).name, "Amara");
  }

  const matches = [
    { mediaId: "m1", honoreeId: "a", excluded: false, similarity: 99 },
    { mediaId: "m1", honoreeId: "y", excluded: false, similarity: 99 },
    { mediaId: "m2", honoreeId: "y", excluded: false, similarity: 90 },
    { mediaId: "m3", honoreeId: "a", excluded: true, similarity: 95 },
  ];
  const review = buildHonorReview([amara, extra, other], matches);
  assert.equal(review.total, 1);
  assert.deepEqual(review.photos.map((photo) => photo.mediaId), ["m1"]);
  assert.equal(photoLabel([amara, extra, other], ["a", "y"]), "Amara");
  assert.equal(review.buckets[0]?.label, "Amara");
  assert.equal(review.buckets[0]?.count, 1);
});

test("wedding review splits both, each person, and keeps exclusions out of the counts", () => {
  const matches = [
    { mediaId: "both-1", honoreeId: "h1", excluded: false, similarity: 90 },
    { mediaId: "both-1", honoreeId: "h2", excluded: false, similarity: 91 },
    { mediaId: "both-2", honoreeId: "h1", excluded: false, similarity: 90 },
    { mediaId: "both-2", honoreeId: "h2", excluded: false, similarity: 88 },
    { mediaId: "mercy-1", honoreeId: "h1", excluded: false, similarity: 92 },
    { mediaId: "john-1", honoreeId: "h2", excluded: false, similarity: 93 },
    { mediaId: "wrong", honoreeId: "h1", excluded: true, similarity: 99 },
    { mediaId: "wrong", honoreeId: "h2", excluded: true, similarity: 99 },
    { mediaId: "stray-only", honoreeId: "h3", excluded: false, similarity: 99 },
  ];
  const review = buildHonorReview([mercy, john, stray], matches);
  assert.equal(review.total, 4);
  const both = review.buckets.find((bucket) => bucket.labelMode === "both");
  const mercyOnly = review.buckets.find((bucket) => bucket.label === "Mercy");
  const johnOnly = review.buckets.find((bucket) => bucket.label === "John");
  assert.equal(both?.count, 2);
  assert.equal(mercyOnly?.count, 1);
  assert.equal(johnOnly?.count, 1);
  assert.equal(review.photos.some((photo) => photo.mediaId === "wrong"), false);
  assert.equal(photoLabel([mercy, john], ["h1", "h2"]), "Mercy & John");
  assert.equal(photoLabel([mercy, john], ["h2"]), "John");
});

test("the guest payload names matched photos and never carries the reference photo or face boxes", () => {
  const media: HonorMediaRef[] = [
    {
      id: "m1",
      mediaKind: "photo",
      uploaderDisplayName: "Chanelle",
      objectKeyDisplay: "display/m1",
      objectKeyThumbnail: "thumb/m1",
      capturedAt: null,
      uploadedAt: "2026-12-19T19:00:00.000Z",
    },
  ];
  const leaked = { ...media[0], sourceObjectKey: "honors/secret.jpg", cropObjectKey: "honors/face-0.jpg", boxLeft: 0.1 };
  const view = buildPublicHonor({
    profile: honorProfileForEventType("wedding"),
    honorees: [mercy, john],
    matches: [
      { mediaId: "m1", honoreeId: "h1", excluded: false, similarity: 90 },
      { mediaId: "m1", honoreeId: "h2", excluded: false, similarity: 90 },
      { mediaId: "ref-photo", honoreeId: "h1", excluded: false, similarity: 100 },
    ],
    media: [leaked],
  });
  assert.ok(view);
  assert.equal(view?.count, 1);
  assert.equal(view?.labels.m1, "Mercy & John");
  assert.equal(view?.fixedKey, "theCouple");
  assert.equal(view?.media[0]?.objectKeyDisplay, "display/m1");
  assert.equal(publicHonorLeaksPrivateFields(view), false);
  assert.equal(JSON.stringify(view).includes("secret"), false);
  assert.equal(JSON.stringify(view).includes("ref-photo"), false);
});

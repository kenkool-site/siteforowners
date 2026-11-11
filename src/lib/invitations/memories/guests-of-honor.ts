// Guests of honor: event-type-aware naming, grouping, and match review.
// Wedding is one profile among several. Nothing here assumes two people.

export type HonorEventKind = "wedding" | "birthday" | "anniversary" | "graduation" | "corporate" | "other";

export type HonorIcon = "rings" | "star";

export type HonorBadgeKey = "autoGrouped" | "birthdayStar" | "graduate" | "honorees";

export type HonorFixedNameKey = "theCouple" | "theGraduate" | "theHonorees" | "guestsOfHonor";

export type HonorRoleKey =
  | "bride"
  | "groom"
  | "birthday_star"
  | "couple"
  | "graduate"
  | "honoree"
  | "speaker"
  | "guest_of_honor";

export type HonorHintKey =
  | "hintWedding"
  | "hintBirthday"
  | "hintAnniversary"
  | "hintGraduation"
  | "hintCorporate"
  | "hintOther";

export interface HonorProfile {
  kind: HonorEventKind;
  /** Typical number of honorees. Null means one or more. A hint, not a hard cap. */
  typicalCount: number | null;
  roles: HonorRoleKey[];
  group: "the_couple" | "person" | "person_or_graduate" | "names_or_honorees";
  badgeKey: HonorBadgeKey;
  icon: HonorIcon;
  hintKey: HonorHintKey;
  kindLabelKey: "kindWedding" | "kindBirthday" | "kindAnniversary" | "kindGraduation" | "kindCorporate" | "kindOther";
}

export interface HonorPerson {
  id: string;
  name: string;
  roleKey: string;
  selected: boolean;
}

export interface HonorMatch {
  mediaId: string;
  honoreeId: string;
  excluded: boolean;
  similarity: number;
}

export interface HonorFaceDraft {
  index: number;
  name: string;
  roleKey: string;
  selected: boolean;
}

export interface HonorMediaRef {
  id: string;
  mediaKind: "photo" | "video";
  uploaderDisplayName: string | null;
  objectKeyDisplay: string | null;
  objectKeyThumbnail: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  durationSeconds?: number | null;
}

const PROFILES: Record<HonorEventKind, HonorProfile> = {
  wedding: {
    kind: "wedding",
    typicalCount: 2,
    roles: ["bride", "groom"],
    group: "the_couple",
    badgeKey: "autoGrouped",
    icon: "rings",
    hintKey: "hintWedding",
    kindLabelKey: "kindWedding",
  },
  birthday: {
    kind: "birthday",
    typicalCount: 1,
    roles: ["birthday_star"],
    group: "person",
    badgeKey: "birthdayStar",
    icon: "star",
    hintKey: "hintBirthday",
    kindLabelKey: "kindBirthday",
  },
  anniversary: {
    kind: "anniversary",
    typicalCount: 2,
    roles: ["couple"],
    group: "the_couple",
    badgeKey: "autoGrouped",
    icon: "rings",
    hintKey: "hintAnniversary",
    kindLabelKey: "kindAnniversary",
  },
  graduation: {
    kind: "graduation",
    typicalCount: 1,
    roles: ["graduate"],
    group: "person_or_graduate",
    badgeKey: "graduate",
    icon: "star",
    hintKey: "hintGraduation",
    kindLabelKey: "kindGraduation",
  },
  corporate: {
    kind: "corporate",
    typicalCount: null,
    roles: ["honoree", "speaker"],
    group: "names_or_honorees",
    badgeKey: "honorees",
    icon: "star",
    hintKey: "hintCorporate",
    kindLabelKey: "kindCorporate",
  },
  other: {
    kind: "other",
    typicalCount: null,
    roles: ["guest_of_honor"],
    group: "names_or_honorees",
    badgeKey: "honorees",
    icon: "star",
    hintKey: "hintOther",
    kindLabelKey: "kindOther",
  },
};

const KIND_ALIASES: Record<string, HonorEventKind> = {
  wedding: "wedding",
  boda: "wedding",
  matrimonio: "wedding",
  birthday: "birthday",
  cumpleanos: "birthday",
  cumple: "birthday",
  anniversary: "anniversary",
  aniversario: "anniversary",
  graduation: "graduation",
  graduacion: "graduation",
  corporate: "corporate",
  corporativo: "corporate",
  conference: "corporate",
  company: "corporate",
};

export function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function honorKindForEventType(eventType: string | null | undefined): HonorEventKind {
  const key = stripDiacritics((eventType ?? "").trim().toLowerCase());
  return KIND_ALIASES[key] ?? "other";
}

export function honorProfileForEventType(eventType: string | null | undefined): HonorProfile {
  return PROFILES[honorKindForEventType(eventType)];
}

export function suggestRoleKeys(profile: HonorProfile, faceCount: number): HonorRoleKey[] {
  if (faceCount <= 0 || profile.roles.length === 0) return [];
  return Array.from({ length: faceCount }, (_, index) => profile.roles[Math.min(index, profile.roles.length - 1)]);
}

export function selectedHonorees(honorees: HonorPerson[]): HonorPerson[] {
  return honorees.filter((person) => person.selected && person.name.trim().length > 0);
}

export function joinNames(names: string[], style: "and" | "ampersand"): string {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  const conjunction = style === "ampersand" ? "&" : "and";
  if (clean.length === 2) return `${clean[0]} ${conjunction} ${clean[1]}`;
  return `${clean.slice(0, -1).join(", ")} ${conjunction} ${clean[clean.length - 1]}`;
}

const NAME_MAX = 80;

export function validateHonorConfirmation(
  profile: HonorProfile,
  faces: HonorFaceDraft[],
  consent: boolean,
):
  | { ok: true; selected: HonorFaceDraft[] }
  | { ok: false; error: "consent_required" | "none_selected" | "name_required" | "unknown_role" | "duplicate_face" } {
  const seen = new Set<number>();
  for (const face of faces) {
    if (seen.has(face.index)) return { ok: false, error: "duplicate_face" };
    seen.add(face.index);
    if (!profile.roles.includes(face.roleKey as HonorRoleKey)) return { ok: false, error: "unknown_role" };
    if (face.selected && face.name.trim().length === 0) return { ok: false, error: "name_required" };
    if (face.name.trim().length > NAME_MAX) return { ok: false, error: "name_required" };
  }
  const selected = faces
    .filter((face) => face.selected)
    .map((face) => ({ ...face, name: face.name.trim() }));
  if (selected.length === 0) return { ok: false, error: "none_selected" };
  if (!consent) return { ok: false, error: "consent_required" };
  return { ok: true, selected };
}

export function consentAudience(names: string[]): { mode: "one" | "two" | "many"; names: string[] } {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length <= 1) return { mode: "one", names: clean };
  if (clean.length === 2) return { mode: "two", names: clean };
  return { mode: "many", names: clean };
}

export function findCta(names: string[]): { mode: "one" | "many"; name: string | null } {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (clean.length === 1) return { mode: "one", name: clean[0] };
  return { mode: "many", name: null };
}

export function hostBannerModel(names: string[]): { mode: "one" | "two" | "many"; names: string[] } {
  return consentAudience(names);
}

export interface HonorGroupPresentation {
  fixedKey: HonorFixedNameKey | null;
  name: string | null;
  badgeKey: HonorBadgeKey;
  icon: HonorIcon;
  chipFixedKey: HonorFixedNameKey | null;
  chipName: string | null;
  subtitleKind: "names" | "birthdayStar" | "graduate" | "honorees";
  subtitleSubject: string | null;
}

export function honorGroupPresentation(profile: HonorProfile, honorees: HonorPerson[]): HonorGroupPresentation {
  const names = selectedHonorees(honorees).map((person) => person.name.trim());
  const joined = joinNames(names, "ampersand");
  const base = { badgeKey: profile.badgeKey, icon: profile.icon };

  if (profile.group === "the_couple") {
    return {
      ...base,
      fixedKey: "theCouple",
      name: null,
      chipFixedKey: "theCouple",
      chipName: null,
      subtitleKind: "names",
      subtitleSubject: joined || null,
    };
  }

  if (profile.group === "person") {
    const name = names[0] ?? "";
    return {
      ...base,
      fixedKey: null,
      name: name || null,
      chipFixedKey: null,
      chipName: name || null,
      subtitleKind: profile.kind === "birthday" ? "birthdayStar" : "names",
      subtitleSubject: profile.kind === "birthday" ? null : name || null,
    };
  }

  if (profile.group === "person_or_graduate") {
    const name = names[0] ?? "";
    if (name) {
      return {
        ...base,
        fixedKey: null,
        name,
        chipFixedKey: null,
        chipName: name,
        subtitleKind: "names",
        subtitleSubject: name,
      };
    }
    return {
      ...base,
      fixedKey: "theGraduate",
      name: null,
      chipFixedKey: "theGraduate",
      chipName: null,
      subtitleKind: "graduate",
      subtitleSubject: null,
    };
  }

  if (names.length === 1) {
    return {
      ...base,
      fixedKey: null,
      name: names[0],
      chipFixedKey: null,
      chipName: names[0],
      subtitleKind: "names",
      subtitleSubject: names[0],
    };
  }
  return {
    ...base,
    fixedKey: profile.kind === "other" ? "guestsOfHonor" : "theHonorees",
    name: null,
    chipFixedKey: profile.kind === "other" ? "guestsOfHonor" : "theHonorees",
    chipName: null,
    subtitleKind: "honorees",
    subtitleSubject: joined || null,
  };
}

export function photoLabel(honorees: HonorPerson[], matchedIds: ReadonlySet<string> | string[]): string | null {
  const ids = matchedIds instanceof Set ? matchedIds : new Set(matchedIds);
  const names = selectedHonorees(honorees)
    .filter((person) => ids.has(person.id))
    .map((person) => person.name.trim());
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return joinNames(names, "ampersand");
}

export interface HonorBucket {
  key: string;
  labelMode: "both" | "all" | "name" | "names";
  label: string;
  count: number;
}

export interface HonorReviewPhoto {
  mediaId: string;
  labelMode: "both" | "all" | "name" | "names";
  label: string;
  honoreeIds: string[];
}

export function buildHonorReview(honorees: HonorPerson[], matches: HonorMatch[]): {
  total: number;
  buckets: HonorBucket[];
  photos: HonorReviewPhoto[];
} {
  const active = selectedHonorees(honorees);
  const activeIds = new Set(active.map((person) => person.id));
  const byMedia = new Map<string, Set<string>>();
  for (const match of matches) {
    if (match.excluded || !activeIds.has(match.honoreeId)) continue;
    const set = byMedia.get(match.mediaId) ?? new Set<string>();
    set.add(match.honoreeId);
    byMedia.set(match.mediaId, set);
  }

  const photos: HonorReviewPhoto[] = [];
  const counts = new Map<string, HonorBucket>();

  function bump(photo: HonorReviewPhoto) {
    photos.push(photo);
    const current = counts.get(photo.labelMode === "name" || photo.labelMode === "names" ? `${photo.labelMode}:${photo.label}` : photo.labelMode);
    const key = photo.labelMode === "name" || photo.labelMode === "names" ? `${photo.labelMode}:${photo.label}` : photo.labelMode;
    if (current) current.count += 1;
    else counts.set(key, { key, labelMode: photo.labelMode, label: photo.label, count: 1 });
  }

  byMedia.forEach((ids, mediaId) => {
    const ordered = active.filter((person) => ids.has(person.id));
    if (ordered.length === 0) return;
    if (ordered.length === active.length && active.length > 1) {
      bump({
        mediaId,
        labelMode: active.length === 2 ? "both" : "all",
        label: "",
        honoreeIds: ordered.map((person) => person.id),
      });
      return;
    }
    if (ordered.length === 1) {
      bump({ mediaId, labelMode: "name", label: ordered[0].name.trim(), honoreeIds: [ordered[0].id] });
      return;
    }
    bump({
      mediaId,
      labelMode: "names",
      label: joinNames(ordered.map((person) => person.name), "ampersand"),
      honoreeIds: ordered.map((person) => person.id),
    });
  });

  const buckets: HonorBucket[] = [];
  counts.forEach((bucket) => buckets.push(bucket));
  return { total: photos.length, buckets, photos };
}

export interface HostHonorFace {
  index: number;
  name: string;
  roleKey: string;
  selected: boolean;
  box: { left: number; top: number; width: number; height: number };
}

export interface HostHonorState {
  status: "empty" | "draft" | "processing" | "ready";
  faces: HostHonorFace[];
  photoCount: number;
  review: ReturnType<typeof buildHonorReview> | null;
  lastError: string | null;
}

export interface PublicHonorView {
  kind: HonorEventKind;
  fixedKey: HonorFixedNameKey | null;
  name: string | null;
  chipFixedKey: HonorFixedNameKey | null;
  chipName: string | null;
  badgeKey: HonorBadgeKey;
  icon: HonorIcon;
  subtitleKind: HonorGroupPresentation["subtitleKind"];
  subtitleSubject: string | null;
  names: string[];
  count: number;
  media: HonorMediaRef[];
  labels: Record<string, string>;
}

export function toPublicHonorMedia(media: HonorMediaRef): HonorMediaRef {
  const copy: HonorMediaRef = {
    id: media.id,
    mediaKind: media.mediaKind,
    uploaderDisplayName: media.uploaderDisplayName,
    objectKeyDisplay: media.objectKeyDisplay,
    objectKeyThumbnail: media.objectKeyThumbnail,
    capturedAt: media.capturedAt,
    uploadedAt: media.uploadedAt,
    durationSeconds: media.durationSeconds ?? null,
  };
  return copy;
}

export function buildPublicHonor(input: {
  profile: HonorProfile;
  honorees: HonorPerson[];
  matches: HonorMatch[];
  media: HonorMediaRef[];
}): PublicHonorView | null {
  const active = selectedHonorees(input.honorees);
  if (active.length === 0) return null;
  const review = buildHonorReview(input.honorees, input.matches);
  const mediaById = new Map(input.media.map((item) => [item.id, item]));
  const visible = review.photos
    .map((photo) => mediaById.get(photo.mediaId))
    .filter((item): item is HonorMediaRef => Boolean(item))
    .map(toPublicHonorMedia);
  const labels: Record<string, string> = {};
  for (const photo of review.photos) {
    if (!mediaById.has(photo.mediaId)) continue;
    const label = photoLabel(input.honorees, photo.honoreeIds);
    if (label) labels[photo.mediaId] = label;
  }
  const presentation = honorGroupPresentation(input.profile, input.honorees);
  return {
    kind: input.profile.kind,
    fixedKey: presentation.fixedKey,
    name: presentation.name,
    chipFixedKey: presentation.chipFixedKey,
    chipName: presentation.chipName,
    badgeKey: presentation.badgeKey,
    icon: presentation.icon,
    subtitleKind: presentation.subtitleKind,
    subtitleSubject: presentation.subtitleSubject,
    names: active.map((person) => person.name.trim()),
    count: visible.length,
    media: visible,
    labels,
  };
}

export function publicHonorLeaksPrivateFields(value: unknown): boolean {
  const json = JSON.stringify(value);
  return json.includes("sourceObjectKey")
    || json.includes("cropObjectKey")
    || json.includes("boxLeft")
    || json.includes("boundingBox")
    || json.includes("source_object_key");
}

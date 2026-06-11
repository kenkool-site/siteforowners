import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeOwnerProfileCopy,
  OWNER_PROFILE_LIMITS,
  ownerProfileToEditable,
  paragraphsToText,
  parseOwnerProfileInput,
  type OwnerProfileInput,
} from "./owner-profile";

const validInput: OwnerProfileInput = {
  business_name: " Bella Studio ",
  phone: " (718) 555-0100 ",
  tagline: " Personal beauty, beautifully done. ",
  admin_email: " OWNER@EXAMPLE.COM ",
  about_en: "First English paragraph.\n\nSecond English paragraph.",
  about_es: "Primer párrafo.\n\nSegundo párrafo.",
  about_image_url: "https://cdn.example.com/owner.webp",
  instagram: "@bellastudio",
  facebook: "bellastudionyc",
  tiktok: "@bellastudio",
};

test("parseOwnerProfileInput normalizes every editable field", () => {
  const result = parseOwnerProfileInput(validInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.business_name, "Bella Studio");
  assert.equal(result.value.phone, "(718) 555-0100");
  assert.equal(result.value.tagline, "Personal beauty, beautifully done.");
  assert.equal(result.value.admin_email, "owner@example.com");
  assert.deepEqual(result.value.about_en, [
    "First English paragraph.",
    "Second English paragraph.",
  ]);
  assert.deepEqual(result.value.about_es, ["Primer párrafo.", "Segundo párrafo."]);
  assert.equal(result.value.about_image_url, "https://cdn.example.com/owner.webp");
  assert.deepEqual(result.value.social_links, {
    instagram: "https://www.instagram.com/bellastudio",
    facebook: "https://www.facebook.com/bellastudionyc",
    tiktok: "https://www.tiktok.com/@bellastudio",
  });
});

test("parseOwnerProfileInput rejects missing business name and invalid email", () => {
  const result = parseOwnerProfileInput({
    ...validInput,
    business_name: " ",
    admin_email: "not-an-email",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.errors.map((error) => error.field),
    ["business_name", "admin_email"],
  );
});

test("parseOwnerProfileInput rejects supplied non-string values with field-specific reasons", () => {
  const result = parseOwnerProfileInput({
    business_name: { value: "Bella Studio" },
    phone: 7185550100,
    tagline: true,
    admin_email: ["owner@example.com"],
    about_en: { paragraph: "English" },
    about_es: 42,
    about_image_url: false,
    instagram: ["bellastudio"],
    facebook: { handle: "bellastudionyc" },
    tiktok: 7,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(result.errors, [
    { field: "business_name", reason: "must be a string" },
    { field: "phone", reason: "must be a string" },
    { field: "tagline", reason: "must be a string" },
    { field: "admin_email", reason: "must be a string" },
    { field: "about_en", reason: "must be a string" },
    { field: "about_es", reason: "must be a string" },
    { field: "about_image_url", reason: "must be a string" },
    { field: "instagram", reason: "must be a string" },
    { field: "facebook", reason: "must be a string" },
    { field: "tiktok", reason: "must be a string" },
  ]);
});

test("parseOwnerProfileInput still requires null or undefined business names", () => {
  for (const businessName of [null, undefined]) {
    const result = parseOwnerProfileInput({
      ...validInput,
      business_name: businessName,
    });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.deepEqual(result.errors, [{ field: "business_name", reason: "required" }]);
  }
});

test("parseOwnerProfileInput enforces field character limits", () => {
  const result = parseOwnerProfileInput({
    ...validInput,
    business_name: "b".repeat(OWNER_PROFILE_LIMITS.businessName + 1),
    phone: "p".repeat(OWNER_PROFILE_LIMITS.phone + 1),
    tagline: "t".repeat(OWNER_PROFILE_LIMITS.tagline + 1),
    about_en: "e".repeat(OWNER_PROFILE_LIMITS.aboutCharacters + 1),
    about_es: "s".repeat(OWNER_PROFILE_LIMITS.aboutCharacters + 1),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(
    result.errors.map((error) => error.field),
    ["business_name", "phone", "tagline", "about_en", "about_es"],
  );
});

test("parseOwnerProfileInput trims paragraphs, removes empty ones, and caps paragraph count", () => {
  const paragraphs = Array.from(
    { length: OWNER_PROFILE_LIMITS.aboutParagraphs + 1 },
    (_, index) => ` Paragraph ${index + 1}. `,
  );
  const result = parseOwnerProfileInput({
    ...validInput,
    about_en: `\n\n${paragraphs.join("\n\n \n\n")}\n\n`,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.deepEqual(result.errors, [
    {
      field: "about_en",
      reason: `max ${OWNER_PROFILE_LIMITS.aboutParagraphs} paragraphs`,
    },
  ]);
});

test("parseOwnerProfileInput accepts blank optional fields and clears image and social links", () => {
  const result = parseOwnerProfileInput({
    ...validInput,
    phone: " ",
    admin_email: "",
    about_image_url: " ",
    instagram: "",
    facebook: " ",
    tiktok: undefined,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.phone, null);
  assert.equal(result.value.admin_email, null);
  assert.equal(result.value.about_image_url, null);
  assert.equal(result.value.social_links, null);
});

test("parseOwnerProfileInput rejects non-https and malformed image URLs", () => {
  for (const aboutImageUrl of ["http://cdn.example.com/owner.webp", "https://"]) {
    const result = parseOwnerProfileInput({
      ...validInput,
      about_image_url: aboutImageUrl,
    });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.deepEqual(result.errors, [
      { field: "about_image_url", reason: "must be an https URL" },
    ]);
  }
});

test("parseOwnerProfileInput rejects credentialed and private or local image URLs", () => {
  const blockedImageUrls = [
    "https://user:pass@example.com/x",
    "https://localhost/x",
    "https://images.localhost/x",
    "https://printer.local/x",
    "https://127.0.0.1/x",
    "https://10.1.2.3/x",
    "https://172.16.0.1/x",
    "https://172.31.255.255/x",
    "https://192.168.1.1/x",
    "https://169.254.10.20/x",
  ];

  for (const aboutImageUrl of blockedImageUrls) {
    const result = parseOwnerProfileInput({
      ...validInput,
      about_image_url: aboutImageUrl,
    });
    assert.equal(result.ok, false, aboutImageUrl);
    if (result.ok) continue;
    assert.deepEqual(
      result.errors,
      [{ field: "about_image_url", reason: "must be an https URL" }],
      aboutImageUrl,
    );
  }
});

test("parseOwnerProfileInput rejects every literal IP image host", () => {
  const literalIpImageUrls = [
    "https://0.0.0.0/x",
    "https://8.8.8.8/x",
    "https://[::1]/x",
    "https://[::ffff:127.0.0.1]/x",
  ];

  for (const aboutImageUrl of literalIpImageUrls) {
    const result = parseOwnerProfileInput({
      ...validInput,
      about_image_url: aboutImageUrl,
    });
    assert.equal(result.ok, false, aboutImageUrl);
    if (result.ok) continue;
    assert.deepEqual(
      result.errors,
      [{ field: "about_image_url", reason: "must be an https URL" }],
      aboutImageUrl,
    );
  }
});

test("parseOwnerProfileInput allows ordinary public HTTPS hostname image URLs", () => {
  const result = parseOwnerProfileInput({
    ...validInput,
    about_image_url: "https://images.example.com/owner.webp",
  });
  assert.equal(result.ok, true);
});

test("mergeOwnerProfileCopy preserves unrelated copy and nested siblings", () => {
  const parsed = parseOwnerProfileInput(validInput);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const merged = mergeOwnerProfileCopy(
    {
      en: { hero_headline: "Welcome", footer_tagline: "Footer" },
      es: { hero_headline: "Bienvenidos", footer_tagline: "Pie" },
      section_settings: { show_about: false, template_override: "runway" },
      social_links: { instagram: "https://www.instagram.com/old" },
      custom_colors: { primary: "#000000" },
    },
    parsed.value,
  );

  assert.deepEqual((merged.en as Record<string, unknown>).about_paragraphs, parsed.value.about_en);
  assert.equal((merged.en as Record<string, unknown>).hero_subheadline, parsed.value.tagline);
  assert.equal((merged.en as Record<string, unknown>).hero_headline, "Welcome");
  assert.equal((merged.en as Record<string, unknown>).footer_tagline, "Footer");
  assert.deepEqual((merged.es as Record<string, unknown>).about_paragraphs, parsed.value.about_es);
  assert.equal((merged.es as Record<string, unknown>).hero_headline, "Bienvenidos");
  assert.equal((merged.es as Record<string, unknown>).footer_tagline, "Pie");
  assert.equal((merged.section_settings as Record<string, unknown>).show_about, false);
  assert.equal(
    (merged.section_settings as Record<string, unknown>).about_image_url,
    parsed.value.about_image_url,
  );
  assert.equal(
    (merged.section_settings as Record<string, unknown>).template_override,
    "runway",
  );
  assert.deepEqual(merged.social_links, parsed.value.social_links);
  assert.deepEqual(merged.custom_colors, { primary: "#000000" });
});

test("mergeOwnerProfileCopy clears image and social links without removing siblings", () => {
  const parsed = parseOwnerProfileInput({
    ...validInput,
    about_image_url: "",
    instagram: "",
    facebook: "",
    tiktok: "",
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const merged = mergeOwnerProfileCopy(
    {
      section_settings: {
        about_image_url: "https://cdn.example.com/old.webp",
        show_about: true,
      },
      social_links: { instagram: "https://www.instagram.com/old" },
    },
    parsed.value,
  );

  assert.deepEqual(merged.section_settings, {
    about_image_url: null,
    show_about: true,
  });
  assert.equal(merged.social_links, null);
});

test("paragraphsToText joins only arrays containing exclusively strings", () => {
  assert.equal(paragraphsToText(["One.", "Two."]), "One.\n\nTwo.");
  assert.equal(paragraphsToText(["One.", 2, null, "Two."]), "");
  assert.equal(paragraphsToText(undefined), "");
  assert.equal(paragraphsToText("One."), "");
});

test("ownerProfileToEditable converts stored preview and tenant values", () => {
  const editable = ownerProfileToEditable(
    {
      business_name: "Bella Studio",
      phone: "(718) 555-0100",
      generated_copy: {
        en: {
          hero_subheadline: "Personal beauty, beautifully done.",
          about_paragraphs: ["First English paragraph.", "Second English paragraph."],
        },
        es: {
          about_paragraphs: ["Primer párrafo.", "Segundo párrafo."],
        },
        section_settings: {
          about_image_url: "https://cdn.example.com/owner.webp",
        },
        social_links: {
          instagram: "https://www.instagram.com/bellastudio",
          facebook: "https://www.facebook.com/bellastudionyc",
          tiktok: "https://www.tiktok.com/@bellastudio",
        },
      },
    },
    {
      phone: "(646) 555-0100",
      admin_email: "owner@example.com",
    },
  );

  assert.deepEqual(editable, {
    business_name: "Bella Studio",
    phone: "(718) 555-0100",
    tagline: "Personal beauty, beautifully done.",
    admin_email: "owner@example.com",
    about_en: "First English paragraph.\n\nSecond English paragraph.",
    about_es: "Primer párrafo.\n\nSegundo párrafo.",
    about_image_url: "https://cdn.example.com/owner.webp",
    instagram: "bellastudio",
    facebook: "bellastudionyc",
    tiktok: "@bellastudio",
  });
});

test("ownerProfileToEditable falls back to tenant phone but never tenant email", () => {
  const editable = ownerProfileToEditable(
    {
      business_name: "Bella Studio",
      phone: null,
      generated_copy: {},
    },
    {
      phone: "(646) 555-0100",
      admin_email: null,
      email: "public-contact@example.com",
    },
  );

  assert.equal(editable.phone, "(646) 555-0100");
  assert.equal(editable.admin_email, "");
});

test("ownerProfileToEditable defaults malformed generated copy safely", () => {
  const editable = ownerProfileToEditable(
    {
      business_name: null,
      phone: 7185550100,
      generated_copy: {
        en: "not-an-object",
        es: { about_paragraphs: ["Valid", 2] },
        section_settings: { about_image_url: 42 },
        social_links: ["not", "an", "object"],
      },
    },
    {
      phone: null,
      admin_email: 42,
    },
  );

  assert.deepEqual(editable, {
    business_name: "",
    phone: "",
    tagline: "",
    admin_email: "",
    about_en: "",
    about_es: "",
    about_image_url: null,
    instagram: "",
    facebook: "",
    tiktok: "",
  });
});

test("ownerProfileToEditable converts a normalized saved profile back to editable text", () => {
  const parsed = parseOwnerProfileInput(validInput);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const generatedCopy = mergeOwnerProfileCopy(
    {
      en: { hero_headline: "Welcome" },
      es: { hero_headline: "Bienvenidos" },
    },
    parsed.value,
  );
  const editable = ownerProfileToEditable(
    {
      business_name: parsed.value.business_name,
      phone: parsed.value.phone,
      generated_copy: generatedCopy,
    },
    {
      phone: parsed.value.phone,
      admin_email: parsed.value.admin_email,
    },
  );

  assert.deepEqual(editable, {
    business_name: "Bella Studio",
    phone: "(718) 555-0100",
    tagline: "Personal beauty, beautifully done.",
    admin_email: "owner@example.com",
    about_en: "First English paragraph.\n\nSecond English paragraph.",
    about_es: "Primer párrafo.\n\nSegundo párrafo.",
    about_image_url: "https://cdn.example.com/owner.webp",
    instagram: "bellastudio",
    facebook: "bellastudionyc",
    tiktok: "@bellastudio",
  });
});

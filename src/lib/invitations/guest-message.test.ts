import assert from "node:assert/strict";
import test from "node:test";
import {
  guestMessageDisplayName,
  gsm7SafeName,
  personalizeGuestMessage,
  previewGuestMessage,
  SAMPLE_GUEST_NAME,
} from "./guest-message";
import { smsOptOutLine, withSmsOptOutFooter } from "./sms-opt-out";

test("a person's first name is used, and a party or household keeps the RSVP name", () => {
  assert.equal(guestMessageDisplayName({ primaryName: "Ada Lovelace", partySize: 1 }), "Ada");
  assert.equal(guestMessageDisplayName({ primaryName: "Dr. Ada Lovelace", partySize: 1 }), "Ada");
  assert.equal(guestMessageDisplayName({ primaryName: "Ada Lovelace", partySize: 2 }), "Ada Lovelace");
  assert.equal(
    guestMessageDisplayName({ primaryName: "Ada Lovelace", partySize: 1, additionalGuestNames: ["Ken"] }),
    "Ada Lovelace",
  );
  assert.equal(guestMessageDisplayName({ primaryName: "The Okonkwo Family", partySize: 4 }), "The Okonkwo Family");
  assert.equal(guestMessageDisplayName({ primaryName: "Mercy and John", partySize: 2 }), "Mercy and John");
  assert.equal(guestMessageDisplayName({ primaryName: "Mercy & John", partySize: 1 }), "Mercy & John");
  assert.equal(guestMessageDisplayName({ primaryName: "   " }), null);
  assert.equal(guestMessageDisplayName({ primaryName: "" }), null);
});

test("SMS names stay GSM-7, and email keeps the written name", () => {
  assert.equal(gsm7SafeName("Zoë"), "Zoe");
  assert.equal(gsm7SafeName("José"), "José");
  assert.equal(gsm7SafeName("Niño"), "Niño");
  assert.equal(gsm7SafeName("Ada’s"), "Ada's");
  assert.equal(gsm7SafeName("Ada 🎉"), "Ada");
  assert.equal(gsm7SafeName("🎉"), null);
  const template = "Hi {guest_name}, hello {first_name}";
  assert.equal(
    personalizeGuestMessage(template, { name: "Zoë Alvarez", locale: "en", channel: "sms" }),
    "Hi Zoe Alvarez, hello Zoe Alvarez",
  );
  assert.equal(
    personalizeGuestMessage(template, { name: "Zoë Alvarez", locale: "en", channel: "email" }),
    "Hi Zoë Alvarez, hello Zoë Alvarez",
  );
});

test("a missing name becomes a neutral greeting, and a typed placeholder is filled", () => {
  assert.equal(
    personalizeGuestMessage("Hi {guest_name}, thank you.", { name: null, locale: "en", channel: "sms" }),
    "Hi there, thank you.",
  );
  assert.equal(
    personalizeGuestMessage("Hola {first_name}, gracias.", { name: " ", locale: "es", channel: "email" }),
    "Hola, gracias.",
  );
  assert.equal(
    personalizeGuestMessage("Hello {guest_name}!", { name: null, locale: "en", channel: "sms" }),
    "Hello there!",
  );
  assert.equal(
    personalizeGuestMessage("See you, {guest_name}.", { name: "Ada", locale: "en", channel: "sms" }),
    "See you, Ada.",
  );
});

test("the opt-out footer is one blank line away and is not added twice", () => {
  const once = withSmsOptOutFooter("See you Saturday", "en");
  assert.equal(once, "See you Saturday\n\nReply STOP to opt out");
  assert.equal(withSmsOptOutFooter(once, "en"), once);
  assert.equal(withSmsOptOutFooter("See you Saturday\nReply STOP to opt out", "es"), "See you Saturday\nReply STOP to opt out");
  assert.equal(withSmsOptOutFooter("Nos vemos\n\nResponde STOP para cancelar", "en"), "Nos vemos\n\nResponde STOP para cancelar");
  assert.equal(smsOptOutLine("es"), "Responde STOP para cancelar");
  const spanish = withSmsOptOutFooter("Nos vemos", "es");
  assert.equal(spanish, "Nos vemos\n\nResponde STOP para cancelar");
  assert.equal(spanish.split("Responde STOP para cancelar").length, 2);
});

test("days_to_go is filled with the guest name, folded for SMS, and omitted cleanly when the day has passed", () => {
  assert.equal(
    personalizeGuestMessage("Hi {guest_name}, just {days_to_go} until our celebration!", {
      name: "Ada",
      locale: "en",
      channel: "sms",
      daysToGo: "12 days to go",
    }),
    "Hi Ada, just 12 days to go until our celebration!",
  );
  assert.equal(
    personalizeGuestMessage("Hi {first_name}, just {days_to_go} until our celebration!", {
      name: null,
      locale: "en",
      channel: "sms",
      daysToGo: "1 day to go",
    }),
    "Hi there, just 1 day to go until our celebration!",
  );
  assert.equal(
    personalizeGuestMessage("Hi {guest_name}, just {days_to_go} until our celebration!", {
      name: "Ada",
      locale: "en",
      channel: "email",
      daysToGo: "",
    }),
    "Hi Ada, just until our celebration!",
  );
  assert.equal(
    personalizeGuestMessage("Hola {guest_name}, solo {days_to_go} para la fiesta.", {
      name: "Ada",
      locale: "es",
      channel: "sms",
      daysToGo: "faltan 12 días",
    }),
    "Hola Ada, solo faltan 12 dias para la fiesta.",
  );
  assert.equal(
    personalizeGuestMessage("Hola {guest_name}, solo {days_to_go} para la fiesta.", {
      name: "Ada",
      locale: "es",
      channel: "email",
      daysToGo: "faltan 12 días",
    }),
    "Hola Ada, solo faltan 12 días para la fiesta.",
  );
  assert.equal(
    personalizeGuestMessage("Hola {guest_name}: {days_to_go}.", {
      name: "Ada",
      locale: "es",
      channel: "sms",
      daysToGo: "¡es hoy!",
    }),
    "Hola Ada: ¡es hoy!",
  );
  const withFooter = withSmsOptOutFooter(
    personalizeGuestMessage("Hi {guest_name}, just {days_to_go} until our celebration", {
      name: "Ada",
      locale: "en",
      channel: "sms",
      daysToGo: "12 days to go",
    }),
    "en",
  );
  assert.equal(withFooter, "Hi Ada, just 12 days to go until our celebration\n\nReply STOP to opt out");
  assert.equal(withFooter.split("Reply STOP to opt out").length, 2);
});

test("the preview uses the longest selected name, or a sample name when nobody is selected", () => {
  const template = "Hi {guest_name}, thank you - Mercy and John";
  const selected = previewGuestMessage({
    template,
    guests: [
      { primaryName: "Ada Lovelace", partySize: 1 },
      { primaryName: "Christopher Okonkwo", partySize: 1 },
    ],
    locale: "en",
    channel: "sms",
  });
  assert.equal(selected.sample, false);
  assert.equal(selected.label, "Christopher");
  assert.match(selected.text, /^Hi Christopher, thank you - Mercy and John\n\nReply STOP to opt out$/);
  assert.equal(selected.text.split("Reply STOP to opt out").length, 2);

  const empty = previewGuestMessage({ template, guests: [], locale: "en", channel: "sms" });
  assert.equal(empty.sample, true);
  assert.equal(empty.label, SAMPLE_GUEST_NAME);
  assert.match(empty.text, new RegExp(`^Hi ${SAMPLE_GUEST_NAME},`));

  const missing = previewGuestMessage({
    template,
    guests: [{ primaryName: " " }],
    locale: "en",
    channel: "email",
  });
  assert.equal(missing.fallback, true);
  assert.equal(missing.text, "Hi there, thank you - Mercy and John");
  assert.doesNotMatch(missing.text, /STOP/);

  const countdown = previewGuestMessage({
    template: "Hi {guest_name}, just {days_to_go} until our celebration",
    guests: [{ primaryName: "Ada Lovelace", partySize: 1 }],
    locale: "en",
    channel: "sms",
    daysToGo: "12 days to go",
  });
  assert.equal(countdown.text, "Hi Ada, just 12 days to go until our celebration\n\nReply STOP to opt out");
});

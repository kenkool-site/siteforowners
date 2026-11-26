import assert from "node:assert/strict";
import test from "node:test";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import {
  MESSAGE_TEMPLATE_KEYS,
  buildMessageTemplateValues,
  findLivestreamUrl,
  type MessageTemplateEvent,
  type MessageTemplateValues,
} from "./message-templates";
import { withSmsOptOutFooter } from "./sms-opt-out";

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_BASIC.includes(char) && !GSM7_EXT.includes(char)) return false;
  }
  return true;
}

function gsm7Septets(text: string): number {
  let count = 0;
  for (const char of text) count += GSM7_EXT.includes(char) ? 2 : 1;
  return count;
}

function fill(template: string, values: MessageTemplateValues): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key as keyof MessageTemplateValues];
    return value ?? `{${key}}`;
  });
}

const event: MessageTemplateEvent = {
  locale: "en",
  title: "You're Invited",
  honoreeNames: "Mercy and John",
  slug: "mercy-john",
  publicSubdomain: "mercy-john",
  startsAt: "2026-12-19T19:00:00.000Z",
  timezone: "America/New_York",
  venueName: "The Bliss",
  address: "100 Main St",
  mapUrl: null,
  rsvpDeadline: "2026-12-12T17:00:00.000Z",
  styleGuide: {
    note: "traditional aso-ebi",
    colors: [
      { name: "gold", color: "#C5A046" },
      { name: "green", color: "#1F6B3A" },
    ],
  },
  additionalSections: [{ heading: "Livestream", content: "Join us at https://zoom.us/j/123456789." }],
};

test("templates insert the host, date, venue, invitation link, and memories link", () => {
  const values = buildMessageTemplateValues(event);
  assert.equal(values.name, "Mercy and John");
  assert.match(values.smsWhen, /Dec/);
  assert.match(values.smsWhen, /2:00/);
  assert.equal(values.venue, "The Bliss");
  assert.equal(values.inviteUrl, "https://mercy-john.invitespot.app/");
  assert.equal(values.memoriesUrl, "https://mercy-john.invitespot.app/memories");
  assert.equal(values.smsDirections, "100 Main St");
  assert.equal(values.smsDressCode, "traditional aso-ebi");
  assert.equal(values.smsColors, "gold, green");
  assert.equal(values.livestream, "https://zoom.us/j/123456789");
  assert.match(values.smsDeadline, /Dec/);
});

test("missing event facts stay as bracketed placeholders the host can edit", () => {
  const values = buildMessageTemplateValues({
    ...event,
    honoreeNames: " ",
    title: "",
    startsAt: null,
    venueName: null,
    address: null,
    mapUrl: null,
    rsvpDeadline: null,
    styleGuide: null,
    additionalSections: [],
  });
  assert.equal(values.name, "[host]");
  assert.equal(values.smsWhen, "[date]");
  assert.equal(values.venue, "[venue]");
  assert.equal(values.smsDirections, "[directions]");
  assert.equal(values.parking, "[parking]");
  assert.equal(values.smsDressCode, "[dress code]");
  assert.equal(values.smsColors, "[colors]");
  assert.equal(values.smsDeadline, "[RSVP deadline]");
  assert.equal(values.livestream, "[livestream link]");
  assert.equal(values.change, "[what changed]");
});

test("a meeting link is used when a section does not say livestream", () => {
  assert.equal(
    findLivestreamUrl([{ heading: "Watch", content: "https://meet.google.com/abc-defg-hij" }]),
    "https://meet.google.com/abc-defg-hij",
  );
  assert.equal(findLivestreamUrl([{ heading: "Hotels", content: "https://hotel.example/stay" }]), null);
});

test("every SMS template is one GSM-7 segment for a typical event, in English and Spanish, including the opt-out line", () => {
  const catalogs = [en, es];
  for (const catalog of catalogs) {
    const locale = catalog === es ? "es" : "en";
    const values = buildMessageTemplateValues({ ...event, locale });
    const templates = catalog.invitations.manage.messageComposer.templates;
    for (const key of MESSAGE_TEMPLATE_KEYS) {
      const template = templates[key];
      assert.equal(typeof template.label, "string");
      assert.equal(typeof template.subject, "string");
      assert.equal(typeof template.email, "string");
      assert.equal(typeof template.sms, "string");
      const drafted = fill(template.sms, values);
      const sms = withSmsOptOutFooter(drafted, locale);
      assert.equal(drafted.includes("{"), false, `${key} sms still has a placeholder: ${drafted}`);
      assert.equal(isGsm7(sms), true, `${key} sms is not GSM-7: ${sms}`);
      assert.ok(gsm7Septets(sms) <= 160, `${key} sms is ${gsm7Septets(sms)} septets with the opt-out line: ${sms}`);
      const email = fill(template.email, values);
      assert.equal(email.includes("{"), false, `${key} email still has a placeholder`);
      assert.ok(email.length > drafted.length, `${key} email should be longer than its SMS`);
    }
  }
});

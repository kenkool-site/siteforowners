import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatInvitationMailbox,
  guestInvitationDisplayName,
  guestInvitationFrom,
  guestInvitationMail,
  guestReplyToAddress,
  hostInvitationFrom,
  invitationSendingAddress,
  normalizeReplyToAddress,
  resendEmailFields,
  sanitizeEmailDisplayName,
} from "./email-from";

const siteForOwnersFrom = { EMAIL_FROM: "SiteForOwners <hello@siteforowners.com>" };

test("guest mail uses the hosts and InviteSpot, on the address inside EMAIL_FROM", () => {
  assert.equal(
    guestInvitationFrom("Mercy & John", siteForOwnersFrom),
    '"Mercy & John via InviteSpot" <hello@siteforowners.com>',
  );
  assert.equal(hostInvitationFrom(siteForOwnersFrom), '"InviteSpot" <hello@siteforowners.com>');
  assert.doesNotMatch(guestInvitationFrom("Mercy & John", siteForOwnersFrom), /SiteForOwners/);
  assert.doesNotMatch(hostInvitationFrom(siteForOwnersFrom), /SiteForOwners/);
});

test("a blank host name falls back to InviteSpot", () => {
  for (const name of ["", "   ", "\n\t", "<>\"", "“”"]) {
    assert.equal(guestInvitationDisplayName(name), "InviteSpot");
    assert.equal(guestInvitationFrom(name, siteForOwnersFrom), '"InviteSpot" <hello@siteforowners.com>');
  }
  assert.equal(
    guestInvitationFrom(null, { EMAIL_FROM: "hello@siteforowners.com" }),
    '"InviteSpot" <hello@siteforowners.com>',
  );
});

test("display names drop quotes, brackets, newlines, and extra length", () => {
  assert.equal(sanitizeEmailDisplayName("Mercy\r\n\"John\" <script>\\"), "Mercy John script");
  assert.equal(
    guestInvitationDisplayName("Mercy\nJohn <bcc:evil@example.com>"),
    "Mercy John bcc:evil@example.com via InviteSpot",
  );
  const long = `${"María ".repeat(40)}& José`;
  const display = guestInvitationDisplayName(long);
  assert.equal(Array.from(display).length <= 78, true);
  assert.match(display, / via InviteSpot$/);
  assert.doesNotMatch(display, /[\r\n<>"]/);
  assert.match(display, /María/);
  assert.equal(formatInvitationMailbox(display, "hello@siteforowners.com"), `"${display}" <hello@siteforowners.com>`);
});

test("an optional InviteSpot address overrides only the mailbox", () => {
  const env = {
    EMAIL_FROM: "SiteForOwners <hello@siteforowners.com>",
    INVITATION_EMAIL_FROM_ADDRESS: "hello@invitespot.app",
  };
  assert.equal(invitationSendingAddress(env), "hello@invitespot.app");
  assert.equal(guestInvitationFrom("Mercy & John", env), '"Mercy & John via InviteSpot" <hello@invitespot.app>');
  assert.equal(
    invitationSendingAddress({ ...env, INVITATION_EMAIL_FROM_ADDRESS: "InviteSpot <hello@invitespot.app>" }),
    "hello@invitespot.app",
  );
});

test("an invalid InviteSpot address falls back to the EMAIL_FROM mailbox", () => {
  assert.equal(
    invitationSendingAddress({
      EMAIL_FROM: '"Site For Owners" <hello@siteforowners.com>',
      INVITATION_EMAIL_FROM_ADDRESS: "not an email\nBcc: evil@example.com",
    }),
    "hello@siteforowners.com",
  );
  assert.equal(invitationSendingAddress({}), "hello@siteforowners.com");
  assert.equal(invitationSendingAddress({ EMAIL_FROM: "hello@siteforowners.com" }), "hello@siteforowners.com");
  assert.equal(normalizeReplyToAddress("  hello@siteforowners.com  "), "hello@siteforowners.com");
  assert.equal(normalizeReplyToAddress("Name <not-an-email>"), undefined);
});

test("guest reply-to is the host contact only when the owner also has an email", () => {
  assert.equal(
    guestReplyToAddress({ hostContactEmail: "hosts@example.com", ownerEmail: "owner@example.com" }),
    "hosts@example.com",
  );
  assert.equal(
    guestReplyToAddress({ hostContactEmail: "Hosts <hosts@example.com>", ownerEmail: "owner@example.com" }),
    "hosts@example.com",
  );
  assert.equal(guestReplyToAddress({ hostContactEmail: "hosts@example.com", ownerEmail: null }), undefined);
  assert.equal(guestReplyToAddress({ hostContactEmail: null, ownerEmail: "owner@example.com" }), undefined);
  assert.equal(
    guestReplyToAddress({ hostContactEmail: "not-an-email", ownerEmail: "owner@example.com" }),
    undefined,
  );
  assert.equal(
    guestReplyToAddress({ hostContactEmail: "hosts@example.com\nBcc: evil@example.com", ownerEmail: "owner@example.com" }),
    undefined,
  );
});

test("guest invitation mail pairs the host display name with reply-to", () => {
  assert.deepEqual(
    guestInvitationMail({
      honoreeNames: "Mercy & John",
      title: "Save the Date in style",
      hostContactEmail: "hosts@example.com",
      ownerEmail: "owner@example.com",
    }, siteForOwnersFrom),
    {
      from: '"Mercy & John via InviteSpot" <hello@siteforowners.com>',
      replyTo: "hosts@example.com",
    },
  );
  assert.deepEqual(
    guestInvitationMail({ honoreeNames: " ", title: "Garden Party", hostContactEmail: "hosts@example.com" }, siteForOwnersFrom),
    { from: '"Garden Party via InviteSpot" <hello@siteforowners.com>' },
  );
});

test("the Resend payload drops an unsafe reply-to and keeps the from header", () => {
  assert.deepEqual(
    resendEmailFields({
      from: '"Mercy & John via InviteSpot" <hello@siteforowners.com>',
      to: "guest@example.com",
      subject: "Thank you",
      html: "<p>Hi</p>",
      replyTo: "hosts@example.com",
    }),
    {
      from: '"Mercy & John via InviteSpot" <hello@siteforowners.com>',
      to: "guest@example.com",
      subject: "Thank you",
      html: "<p>Hi</p>",
      replyTo: "hosts@example.com",
    },
  );
  const dropped = resendEmailFields({
    from: '"InviteSpot" <hello@siteforowners.com>',
    to: "owner@example.com",
    subject: "New RSVP",
    html: "<p>Hi</p>",
    replyTo: "bad\nheader",
  });
  assert.equal("replyTo" in dropped, false);
});

test("SiteForOwners product mail still sends as SiteForOwners", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const productMail = [
    join(here, "../email.ts"),
    join(here, "../estimate-email.ts"),
    join(here, "../../app/api/marketing-leads/route.ts"),
  ];
  for (const path of productMail) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /SiteForOwners <hello@siteforowners\.com>/);
    assert.doesNotMatch(source, /guestInvitationFrom|hostInvitationFrom|INVITATION_EMAIL_FROM_ADDRESS/);
  }
  const invitations = readFileSync(join(here, "../../../messages/en.json"), "utf8");
  const spanish = readFileSync(join(here, "../../../messages/es.json"), "utf8");
  const enInvitations = JSON.stringify(JSON.parse(invitations).invitations);
  const esInvitations = JSON.stringify(JSON.parse(spanish).invitations);
  assert.doesNotMatch(enInvitations, /SiteForOwners/);
  assert.doesNotMatch(esInvitations, /SiteForOwners/);
});

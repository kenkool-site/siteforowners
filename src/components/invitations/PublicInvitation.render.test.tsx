import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InvitationStateView, PublicInvitation, type PublicInvitationEvent } from "./PublicInvitation";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";
import { DEFAULT_INVITATION_DESIGN_RECIPE } from "@/lib/invitations/design-recipe";

Object.assign(globalThis, { React });

// PublicInvitation now fetches its media client-side on mount (so the public
// invitation page can drop cookies()/headers() and stay cacheable — see
// src/lib/invitations/public-access.ts). renderToStaticMarkup never runs
// effects at all, so tests that assert on actual cover/gallery/video content
// need a real mounted DOM (jsdom + act) with fetch mocked; everything else
// in this file stays on the plain synchronous renderToStaticMarkup helper
// below, where media simply never loads (null) — harmless, since those tests
// don't assert on media.
const MOUNT_GLOBAL_KEYS = ["window", "document", "HTMLElement", "HTMLButtonElement", "navigator", "IS_REACT_ACT_ENVIRONMENT", "fetch"] as const;

async function renderMounted(node: React.ReactNode, media: InvitationMediaSnapshot): Promise<string> {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://invite.example.test" });
  const originals = new Map(MOUNT_GLOBAL_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => new Response(JSON.stringify(media)),
  });
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  dom.window.scrollTo = (() => undefined) as typeof dom.window.scrollTo;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.window.document.querySelector("#root")!);
  try {
    await act(async () => {
      root.render(node);
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    return dom.window.document.querySelector("#root")!.innerHTML;
  } finally {
    await act(async () => root.unmount());
    originals.forEach((descriptor, key) => (descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete (globalThis as Record<string, unknown>)[key]));
  }
}

test("full preview renders private media and locale with the RSVP form initially collapsed", async () => {
  const html = await renderMounted(
    <NextIntlClientProvider locale="es" messages={esMessages} timeZone="America/New_York">
      <PublicInvitation event={{ ...event, locale: "es" }} state="published" rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} preview />
    </NextIntlClientProvider>,
    media,
  );
  assert.match(html, /https:\/\/signed.example.test\/video/);
  assert.match(html, /Mia and Lee/);
  assert.match(html, /<button[^>]*>Responder a esta invitación<\/button>/);
  assert.doesNotMatch(html, /name="primaryName"/);
});

const event: PublicInvitationEvent = {
  id: "event-1",
  slug: "mia-and-lee",
  eventType: "wedding",
  locale: "en",
  title: "Mia & Lee",
  honoreeNames: "Mia and Lee",
  description: "Celebrate with us — exactly as written.",
  startsAt: "2026-10-10T22:00:00.000Z",
  endsAt: "2026-10-11T03:00:00.000Z",
  rsvpDeadline: null,
  timezone: "America/New_York",
  venueName: "The Garden",
  venueUrl: null,
  address: "42 Celebration Way",
  mapUrl: "https://maps.example.test/garden",
  themeKey: "classic",
  primaryColor: "#18253A",
  accentColor: "#9B6A44",
  fontPairKey: "fraunces-geist",
  designRecipe: null,
  showPublicRsvpCount: true,
  commentWallEnabled: false,
};

const media: InvitationMediaSnapshot = {
  designedInvite: { kind: "designed_invite", path: "event-1/designed_invite/a.png", url: "https://signed.example.test/invite" },
  cover: { kind: "cover", path: "event-1/cover/a.png", url: "https://signed.example.test/cover" },
  video: { kind: "video", path: "event-1/video/a.mp4", url: "https://signed.example.test/video" },
  gallery: [{ id: "photo-1", kind: "gallery", path: "event-1/gallery/a.png", url: "https://signed.example.test/gallery", altText: "Mia and Lee outdoors", sortOrder: 0 }],
};

function render(
  state: "published" | "rsvp_closed" | "expired" | "draft",
  overrides: Partial<PublicInvitationEvent> = {},
  locale: "en" | "es" = "en",
  rsvpSummary = { attendingPeople: 17, declinedParties: 3 },
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? esMessages : enMessages}
      timeZone={event.timezone}
    >
      {state === "draft" || state === "expired" ? (
        <InvitationStateView state={state} />
      ) : (
        <PublicInvitation
          event={{ ...event, locale, ...overrides }}
          state={state}
          rsvpSummary={rsvpSummary}
        />
      )}
    </NextIntlClientProvider>,
  );
}

test("a published invitation celebrates attending guests without exposing declined totals", () => {
  const html = render("published");

  for (const expected of ["Mia and Lee", "42 Celebration Way", "https://maps.example.test/garden", "Respond to this invitation", "17 guests are celebrating with us"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.doesNotMatch(html, /3 parties unable to attend|declined|not attending/i);
  assert.match(html, /data-invitation-venue="true"[^>]*>The Garden</);
  assert.match(html, /https:\/\/calendar\.google\.com\/calendar\/render/);
  assert.match(html, /<button[^>]*>Respond to this invitation<\/button>/);
  assert.doesNotMatch(html, /name="primaryName"/, "the full RSVP form should stay closed until requested");
  for (const privateGuestValue of ["guest@example.com", "+19175550199", "peanut allergy", "Guest Two"]) {
    assert.doesNotMatch(html, new RegExp(privateGuestValue.replace("+", "\\+"), "i"));
  }
});

test("an optional venue website links the venue name on the cover and in event details", () => {
  const html = render("published", {
    venueUrl: "https://www.theblissataubrey.com/",
  } as unknown as Partial<PublicInvitationEvent>);
  const links = html.match(/href="https:\/\/www\.theblissataubrey\.com\/"/g) ?? [];
  assert.equal(links.length, 2);
  assert.doesNotMatch(html, />https:\/\/www\.theblissataubrey\.com\/</);
});

test("the public celebration count uses singular guest grammar", () => {
  const html = render("published", {}, "en", { attendingPeople: 1, declinedParties: 4 });
  assert.match(html, /1 guest is celebrating with us/);
  assert.doesNotMatch(html, /4 parties unable to attend|1 guests are/);
});

test("a published invitation shows its RSVP deadline in the public details", () => {
  const html = render("published", { rsvpDeadline: "2026-10-01T03:59:00.000Z" });
  assert.match(html, /Please RSVP by September 30, 2026/);
});

test("a closed invitation replaces its RSVP deadline with a closed notice", () => {
  const html = render("rsvp_closed", { rsvpDeadline: "2026-10-01T03:59:00.000Z" });
  assert.match(html, /RSVPs are closed/);
  assert.doesNotMatch(html, /Please RSVP by/);
});

test("expired and draft states reveal no authored details or signed media", () => {
  for (const state of ["expired", "draft"] as const) {
    const html = render(state);
    for (const privateValue of ["Mia", "42 Celebration Way", "The Garden", "exactly as written", "signed.example.test"]) {
      assert.doesNotMatch(html, new RegExp(privateValue));
    }
  }
  assert.match(render("expired"), /This event has ended/);
  assert.match(render("draft"), /This invitation is unavailable/);
});

test("public totals disappear completely when the owner disables them", () => {
  const html = render("published", { showPublicRsvpCount: false });
  assert.doesNotMatch(html, /17 attending|3 unable to attend|guest count|RSVP count/i);
});

test("closed invitations keep their details but replace the new RSVP action", () => {
  const html = render("rsvp_closed");
  assert.match(html, /Mia and Lee/);
  assert.match(html, /42 Celebration Way/);
  assert.match(html, /Responses are closed/);
  assert.doesNotMatch(html, /Respond to this invitation/);
});

test("Spanish event locale translates system copy without changing authored copy", () => {
  const html = render("published", {}, "es");
  assert.match(html, /Responder a esta invitación/);
  assert.match(html, /17 invitados celebrarán con nosotros/);
  assert.match(html, /Celebrate with us — exactly as written\./);
});

test("the three public themes produce structurally different invitation layouts", () => {
  const classic = render("published", { themeKey: "classic" });
  const romantic = render("published", { themeKey: "romantic" });
  const celebration = render("published", { themeKey: "celebration" });

  assert.match(classic, /data-invitation-layout="centered-frame"/);
  assert.match(romantic, /data-invitation-layout="image-asymmetry"/);
  assert.match(celebration, /data-invitation-layout="offset-blocks"/);
});

test("the cover opens the invitation and the private designed reference is never rendered", async () => {
  const html = await renderMounted(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
      <PublicInvitation event={event} state="published" rsvpSummary={{ attendingPeople: 17, declinedParties: 3 }} />
    </NextIntlClientProvider>,
    media,
  );
  assert.match(html, /data-invitation-hero="cover"/);
  assert.match(html, /https:\/\/signed\.example\.test\/cover/);
  assert.doesNotMatch(html, /https:\/\/signed\.example\.test\/invite/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1, "the opening should be the only invitation title block");
  assert.ok(html.indexOf("Mia and Lee") < html.indexOf("Saturday, October 10, 2026"), "the date should sit below the title in the opening composition");
});

test("the public invitation has a guest-facing marketing CTA plus discreet platform and host sign-in footer links", () => {
  const html = render("published");
  assert.match(html, /href="https:\/\/www\.invitespot\.app\/\?from=mia-and-lee"[^>]*>Hosting your own event\? Create your invitation with InviteSpot/);
  assert.match(html, /href="https:\/\/www\.invitespot\.app\/"[^>]*>Powered by InviteSpot/);
  assert.match(html, /href="https:\/\/www\.siteforowners\.com\/invitations\/login"[^>]*>Host sign in/);
});

test("the honoree names lead the hero while a distinct extracted title supports them", () => {
  const html = render("published", { title: "Save the Date in style", honoreeNames: "Mercy & John" });
  assert.match(html, /<h1[^>]*>Mercy &amp; John<\/h1>/);
  assert.match(html, /data-invitation-kicker="true"[^>]*>Save the Date in style<\/p>/);
});

test("the cover renders the selected decorative frame with the dynamic accent color", () => {
  const recipe = structuredClone(DEFAULT_INVITATION_DESIGN_RECIPE);
  recipe.frame.style = "floral";
  recipe.palette.accent = "#C27A91";
  const html = render("published", { designRecipe: recipe });
  assert.match(html, /data-invitation-frame="floral"/);
  assert.match(html, /border-color:#C27A91/);
  assert.match(html, /<svg/);
});

test("gallery photos stack on mobile and balance into two columns on larger screens", async () => {
  const galleryMedia = {
    ...media,
    gallery: [
      media.gallery[0]!,
      { ...media.gallery[0]!, id: "photo-2", path: "event-1/gallery/b.png", url: "https://signed.example.test/gallery-2", sortOrder: 1 },
    ],
  };
  const html = await renderMounted(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
      <PublicInvitation event={event} state="published" rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
    </NextIntlClientProvider>,
    galleryMedia,
  );
  assert.match(html, /data-invitation-gallery="true"[^>]*class="[^"]*grid-cols-1[^"]*sm:grid-cols-2/);
});

test("publicly-cacheable gallery media renders through next/image while preserving sizing classes", async () => {
  const publicMedia: InvitationMediaSnapshot = {
    ...media,
    gallery: [
      { id: "photo-1", kind: "gallery", path: "event-1/gallery/a.png", url: "/api/invitations/public/mia-and-lee/gallery/photo-1", altText: "Mia and Lee outdoors", sortOrder: 0 },
      { id: "photo-2", kind: "gallery", path: "event-1/gallery/b.png", url: "/api/invitations/public/mia-and-lee/gallery/photo-2", altText: "Mia and Lee dancing", sortOrder: 1 },
    ],
  };
  const html = await renderMounted(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
      <PublicInvitation event={event} state="published" rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
    </NextIntlClientProvider>,
    publicMedia,
  );
  // next/image renders a real <img> in the DOM (with its own generated sizes
  // attribute) directly inside the wrapping div the "fill" layout requires —
  // confirm that wrapper still carries the aspect-[4/5] sizing class the
  // gallery grid relies on, i.e. the conversion didn't drop it.
  const wrapperMatch = html.match(/<div class="[^"]*aspect-\[4\/5\][^"]*"[^>]*>\s*<img[^>]*>/);
  assert.ok(wrapperMatch, `expected a next/image <img> inside an aspect-[4/5] wrapper; got: ${html}`);
  assert.match(wrapperMatch![0], /sizes="\(max-width: 768px\) 100vw, 768px"/);
  assert.match(wrapperMatch![0], /src="\/_next\/image\?url=/, "confirms next/image's optimization pipeline is actually engaged, not just a plain <img>");
  assert.doesNotMatch(html, /https:\/\/signed\.example\.test\/gallery/, "passcode-only signed gallery URLs should never appear for public media");
});

test("optional travel information highlights one hotel and links guest directions", () => {
  const travelEvent = {
    ...event,
    travelInfo: {
      airports: [{ name: "Dallas Fort Worth International", note: "About 35 minutes from the venue", directionsUrl: "https://maps.example.test/dfw" }],
      hotels: [
        { name: "The Grand Hotel", address: "10 Main Street, Dallas, TX", recommended: true },
        { name: "City Lodge", address: "20 Oak Road, Dallas, TX", recommended: false },
      ],
    },
  } as PublicInvitationEvent;
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
    <PublicInvitation event={travelEvent} state="published" rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
  </NextIntlClientProvider>);
  for (const expected of ["Travel information", "Closest airports", "Dallas Fort Worth International", "Recommended hotel", "The Grand Hotel", "City Lodge"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(html, /https:\/\/maps\.example\.test\/dfw/);
  assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=10%20Main%20Street%2C%20Dallas%2C%20TX/);
});

test("travel information stays hidden when the optional lists are empty", () => {
  const html = render("published", { travelInfo: { airports: [], hotels: [] } } as Partial<PublicInvitationEvent>);
  assert.doesNotMatch(html, /Travel information|Closest airports|Nearby hotels/);
});

test("optional structured style guidance renders outside the welcome description", () => {
  const html = render("published", {
    styleGuide: { note: "Glamorous fascinators", colors: [{ name: "Sage", color: "#AAB39A" }] },
  });
  assert.match(html, /Style guide/i);
  assert.match(html, /Glamorous fascinators/);
  assert.match(html, /aria-label="Sage: #AAB39A"/);
  assert.equal((html.match(/Glamorous fascinators/g) ?? []).length, 1);
});

test("flexible additional sections render headings and preserve authored line breaks", () => {
  const html = render("published", {
    additionalSections: [
      { heading: "Wedding Day Schedule", content: "Wedding Ceremony @ 1pm\nCocktail @ 2:30pm\nWedding Reception @ 3:30pm" },
      { heading: "Dress Code", content: "Dressing Code" },
    ],
  });
  for (const expected of ["Wedding Day Schedule", "Wedding Ceremony @ 1pm", "Cocktail @ 2:30pm", "Wedding Reception @ 3:30pm", "Dress Code", "Dressing Code"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(html, /Wedding Ceremony @ 1pm[\s\S]*<br\/>[\s\S]*Cocktail @ 2:30pm/);
});

test("the Event Schedule card renders items in order with location lines only where set", () => {
  const html = render("published", {
    eventSchedule: [
      { name: "Wedding Ceremony", startsAt: "2026-10-10T17:00:00.000Z", locationName: "St. Mary's Catholic Church", locationAddress: "123 Chapel St, Brooklyn, NY" },
      { name: "Cocktail Hour", startsAt: "2026-10-10T18:30:00.000Z" },
      { name: "Wedding Reception", startsAt: "2026-10-10T19:30:00.000Z", locationName: "The Grand Ballroom" },
    ],
  });
  assert.match(html, /Event Schedule/);
  const ceremonyIndex = html.indexOf("Wedding Ceremony");
  const cocktailIndex = html.indexOf("Cocktail Hour");
  const receptionIndex = html.indexOf("Wedding Reception");
  assert.ok(ceremonyIndex > -1 && cocktailIndex > ceremonyIndex && receptionIndex > cocktailIndex, "expected items in chronological order");
  assert.match(html, /St\. Mary&#x27;s Catholic Church — 123 Chapel St, Brooklyn, NY/);
  assert.match(html, /The Grand Ballroom/);
  assert.doesNotMatch(html, /The Grand Ballroom —/, "expected no trailing separator when only locationName is set");
  // Cocktail Hour has neither location field — no stray " — " or empty location line near it.
  const cocktailSection = html.slice(cocktailIndex, receptionIndex);
  assert.doesNotMatch(cocktailSection, /—/);
});

test("the Event Schedule card is entirely absent when the event has no schedule items", () => {
  const html = render("published", { eventSchedule: [] });
  assert.doesNotMatch(html, /Event Schedule/);
});

test("the Event Schedule card is absent when eventSchedule is undefined (pre-existing events)", () => {
  const html = render("published");
  assert.doesNotMatch(html, /Event Schedule/);
});

test("enabled guestbook renders after invitation content and before the footer", () => {
  const html = render("published", { commentWallEnabled: true });
  assert.match(html, /data-invitation-comment-wall="true"/);
  assert.ok(html.indexOf('data-invitation-comment-wall="true"') < html.indexOf('data-invitation-footer="true"'));
  assert.match(html, /Leave a note/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import enMessages from "../../../../../messages/en.json";
import esMessages from "../../../../../messages/es.json";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { StateView } from "@/components/invitations/PublicInvitation";

Object.assign(globalThis, { React });

// GuestMemoriesPage itself can't be imported/invoked here: it fetches the
// invitation and memories settings server-side via getPublicInvitationBySlug
// / getEventMemoriesSettings (Supabase), which this test environment can't
// reach — same constraint noted in src/app/invitespot/page.render.test.tsx.
// So the themed empty state is verified two ways: render the exact JSX
// shape the branch produces for both the "upcoming" and "past" cases
// (mirroring the endsAt-falls-back-to-startsAt / Date.parse <= now logic in
// page.tsx), and confirm structurally (further down) that page.tsx actually
// wires that shape to the right condition while leaving the other two
// notFound() branches untouched.
function eventHasPassed(startsAt: string | null, endsAt: string | null): boolean {
  const referenceDate = endsAt ?? startsAt;
  return Boolean(referenceDate && Date.parse(referenceDate) <= Date.now());
}

function renderMemoriesUnavailable(locale: "en" | "es", slug: string, startsAt: string | null, endsAt: string | null): string {
  const copy = (locale === "es" ? esMessages : enMessages).invitations.public;
  const unavailableCopy = eventHasPassed(startsAt, endsAt) ? copy.memories.unavailable.past : copy.memories.unavailable.upcoming;
  return renderToStaticMarkup(
    <InvitationPublicProvider locale={locale} timeZone="UTC">
      <StateView>
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{unavailableCopy.title}</h1>
        <p className="mt-4 text-base leading-7 text-[#665C69]">{unavailableCopy.body}</p>
        <Link href={`/invite/${slug}`} className="mt-6 inline-block text-sm font-semibold text-[#73516F] underline-offset-4 hover:underline">
          {copy.viewInvitation}
        </Link>
      </StateView>
    </InvitationPublicProvider>,
  );
}

const FUTURE = "2099-06-15T18:00:00.000Z";
const PAST = "2020-01-01T18:00:00.000Z";

test("an upcoming event (future startsAt/endsAt) renders the 'upcoming' empty-state copy (English)", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee", FUTURE, FUTURE);
  assert.match(html, /Memories isn&#x27;t available yet/);
  assert.match(html, /The host hasn&#x27;t turned on guest photo sharing for this event yet\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>View invitation</);
});

test("an upcoming event (future startsAt/endsAt) renders the 'upcoming' empty-state copy (Spanish)", () => {
  const html = renderMemoriesUnavailable("es", "mia-and-lee", FUTURE, FUTURE);
  assert.match(html, /Los recuerdos aún no están disponibles/);
  assert.match(html, /El anfitrión aún no ha activado la opción para compartir fotos en este evento\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>Ver invitación</);
});

test("an event with no startsAt/endsAt at all is treated as upcoming, not past", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee", null, null);
  assert.match(html, /Memories isn&#x27;t available yet/);
});

test("a past event (endsAt in the past) renders the 'past' empty-state copy (English)", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee", FUTURE, PAST);
  assert.match(html, /Memories isn&#x27;t available</);
  assert.doesNotMatch(html, /Memories isn&#x27;t available yet/);
  assert.match(html, /Guest photo sharing is now turned off for this event\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>View invitation</);
});

test("a past event (endsAt in the past) renders the 'past' empty-state copy (Spanish)", () => {
  const html = renderMemoriesUnavailable("es", "mia-and-lee", FUTURE, PAST);
  assert.match(html, /Los recuerdos ya no están disponibles/);
  assert.match(html, /La opción para compartir fotos está desactivada para este evento\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>Ver invitación</);
});

test("a past event with no endsAt falls back to startsAt to decide it has passed", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee", PAST, null);
  assert.match(html, /Guest photo sharing is now turned off for this event\./);
});

test("the memories-unavailable state is not the bare Next.js 404 — it uses the themed StateView wrapper", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee", FUTURE, FUTURE);
  // StateView's own signature markup (see PublicInvitation.tsx) — confirms
  // this goes through the shared themed wrapper, not a plain fragment.
  assert.match(html, /<main class="flex min-h-screen items-center justify-center bg-\[#F2EEF4\]/);
});

test("the invitation-missing and event-offline branches stay bare notFound(), untouched by the themed empty state", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!invitation\) notFound\(\);/);
  assert.match(source, /if \(invitation\.event\.status === "offline"\) notFound\(\);/);
});

test("only the memories-disabled branch renders the themed StateView instead of notFound(), choosing upcoming/past copy from the event date", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!settings \|\| !settings\.memoriesEnabled\) \{/);
  assert.doesNotMatch(source, /if \(!settings \|\| !settings\.memoriesEnabled\) notFound\(\);/);
  assert.match(source, /invitation\.event\.endsAt \?\? invitation\.event\.startsAt/);
  assert.match(source, /copy\.memories\.unavailable\.past/);
  assert.match(source, /copy\.memories\.unavailable\.upcoming/);
  assert.match(source, /copy\.viewInvitation/);
  assert.match(source, /import \{ StateView \} from "@\/components\/invitations\/PublicInvitation";/);
});

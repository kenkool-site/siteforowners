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
// shape the new branch produces (below), and confirm structurally (further
// down) that page.tsx actually wires that shape to the right condition
// while leaving the other two notFound() branches untouched.
function renderMemoriesUnavailable(locale: "en" | "es", slug: string): string {
  const copy = (locale === "es" ? esMessages : enMessages).invitations.public;
  return renderToStaticMarkup(
    <InvitationPublicProvider locale={locale} timeZone="UTC">
      <StateView>
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl">{copy.memories.unavailable.title}</h1>
        <p className="mt-4 text-base leading-7 text-[#665C69]">{copy.memories.unavailable.body}</p>
        <Link href={`/invite/${slug}`} className="mt-6 inline-block text-sm font-semibold text-[#73516F] underline-offset-4 hover:underline">
          {copy.viewInvitation}
        </Link>
      </StateView>
    </InvitationPublicProvider>,
  );
}

test("the memories-unavailable state renders a themed heading, body, and link back to the invitation (English)", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee");
  assert.match(html, /Memories isn&#x27;t available for this event/);
  assert.match(html, /The host hasn&#x27;t turned on guest photo sharing yet\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>View invitation</);
});

test("the memories-unavailable state renders Spanish copy for a Spanish-locale event", () => {
  const html = renderMemoriesUnavailable("es", "mia-and-lee");
  assert.match(html, /Los recuerdos no están disponibles para este evento/);
  assert.match(html, /El anfitrión aún no ha activado la opción para compartir fotos\./);
  assert.match(html, /href="\/invite\/mia-and-lee"[^>]*>Ver invitación</);
});

test("the memories-unavailable state is not the bare Next.js 404 — it uses the themed StateView wrapper", () => {
  const html = renderMemoriesUnavailable("en", "mia-and-lee");
  // StateView's own signature markup (see PublicInvitation.tsx) — confirms
  // this goes through the shared themed wrapper, not a plain fragment.
  assert.match(html, /<main class="flex min-h-screen items-center justify-center bg-\[#F2EEF4\]/);
});

test("the invitation-missing and event-offline branches stay bare notFound(), untouched by the themed empty state", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!invitation\) notFound\(\);/);
  assert.match(source, /if \(invitation\.event\.status === "offline"\) notFound\(\);/);
});

test("only the memories-disabled branch renders the themed StateView instead of notFound()", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!settings \|\| !settings\.memoriesEnabled\) \{/);
  assert.doesNotMatch(source, /if \(!settings \|\| !settings\.memoriesEnabled\) notFound\(\);/);
  assert.match(source, /copy\.memories\.unavailable\.title/);
  assert.match(source, /copy\.memories\.unavailable\.body/);
  assert.match(source, /copy\.viewInvitation/);
  assert.match(source, /import \{ StateView \} from "@\/components\/invitations\/PublicInvitation";/);
});

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PasscodeGate } from "@/components/invitations/PasscodeGate";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { invitationPageMetadata } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    return invitationPageMetadata(invitation, null);
  } catch {
    return invitationPageMetadata(null, null);
  }
}

export default async function InvitationLockedPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { next?: string };
}) {
  const invitation = await getPublicInvitationBySlug(params.slug);
  if (!invitation) notFound();

  // Only trust a same-event relative path — anything else (an absolute
  // URL, a different event's path) is dropped rather than handed to
  // window.location.href client-side, which would otherwise make ?next=
  // an open redirect. Falls back to the main invite page itself so
  // PasscodeGate's post-success reload always lands somewhere sensible,
  // never re-showing this same locked page in a loop.
  const redirectTo =
    typeof searchParams.next === "string" && searchParams.next.startsWith(`/invite/${params.slug}`)
      ? searchParams.next
      : `/invite/${params.slug}`;
  return (
    <InvitationPublicProvider locale={invitation.event.locale} timeZone="UTC">
      <PasscodeGate slug={params.slug} redirectTo={redirectTo} />
    </InvitationPublicProvider>
  );
}

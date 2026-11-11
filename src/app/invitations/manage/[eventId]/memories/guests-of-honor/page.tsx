import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestsOfHonorPage } from "@/components/invitations/memories/GuestsOfHonorPage";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";

export const dynamic = "force-dynamic";

export default async function OwnerGuestsOfHonorPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try { ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null; } catch { ownerId = null; }
  if (!ownerId) redirect("/invitations/login");
  if (!await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();
  return <GuestsOfHonorPage eventId={params.eventId} backHref={`/invitations/manage/${params.eventId}/memories`} />;
}

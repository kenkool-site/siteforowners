import { isGuestToken } from "@/lib/invitations/guest-list";
import { getGuestByToken } from "@/lib/invitations/guest-list-store";
import {
  genericInvitationOgPlan,
  invitationOpenGraphResponse,
  renderInvitationOgPlan,
} from "@/lib/invitations/og-image";

export const runtime = "nodejs";
export const alt = "Invitation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function PersonalTwitterImage({ params }: { params: { token: string } }) {
  if (!isGuestToken(params.token)) return renderInvitationOgPlan(genericInvitationOgPlan());
  try {
    const loaded = await getGuestByToken(params.token);
    if (!loaded?.event.privateGuestListEnabled) return renderInvitationOgPlan(genericInvitationOgPlan());
    return invitationOpenGraphResponse({ slug: loaded.event.slug, page: "invite" });
  } catch {
    return renderInvitationOgPlan(genericInvitationOgPlan());
  }
}

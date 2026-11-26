import { invitationOpenGraphResponse } from "@/lib/invitations/og-image";

export const runtime = "nodejs";
export const alt = "Invitation";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage({ params }: { params: { slug: string } }) {
  return invitationOpenGraphResponse({ slug: params.slug, page: "invite" });
}

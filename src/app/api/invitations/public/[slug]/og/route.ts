import { invitationOpenGraphResponse } from "@/lib/invitations/og-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  return invitationOpenGraphResponse({ slug: params.slug, page: "invite" });
}

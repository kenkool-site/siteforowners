import { ImageResponse } from "next/og";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { formatInTimeZone, venueLine } from "@/lib/invitations/memories/guest-presentation";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function MemoriesOpenGraphImage({ params }: { params: { slug: string } }) {
  let names = "Memories";
  let detail = "";
  let showBrand = true;
  try {
    const invitation = await getPublicInvitationBySlug(params.slug);
    if (invitation) {
      names = invitation.event.honoreeNames.trim() || invitation.event.title;
      const when = formatInTimeZone(invitation.event.startsAt, invitation.event.timezone, invitation.event.locale, { month: "short", day: "numeric", year: "numeric" });
      detail = [when, venueLine(invitation.event.venueName, invitation.event.address)].filter(Boolean).join(" · ");
      const settings = await getEventMemoriesSettings(invitation.event.id);
      showBrand = settings?.brandingEnabled !== false;
    }
  } catch {
    showBrand = true;
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "linear-gradient(135deg, #2f6b4c 0%, #1c4632 45%, #133222 100%)", color: "white", padding: 72, position: "relative" }}>
        {showBrand && (
          <div style={{ position: "absolute", top: 48, left: 72, display: "flex", alignItems: "center", fontSize: 28, opacity: 0.85 }}>
            Shared via InviteSpot
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 84, lineHeight: 1.05 }}>{names}</div>
          {detail ? <div style={{ marginTop: 18, fontSize: 32, opacity: 0.85 }}>{detail}</div> : null}
        </div>
      </div>
    ),
    { ...size },
  );
}

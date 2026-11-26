import { ImageResponse } from "next/og";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { INVITATION_MEDIA_BUCKET, isInvitationMediaPathForEvent } from "./media";
import { getEventMemoriesSettings } from "./memories/repository";
import { invitationOgPlan, type InvitationOgPlan } from "./public-access";
import { getPublicInvitationBySlug } from "./repository";
import { getEffectiveEventState } from "./state";

const SIZE = { width: 1200, height: 630 };
const CACHE = "public, max-age=300, s-maxage=300";

function pngResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": CACHE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function coverPng(plan: InvitationOgPlan): Promise<Buffer | null> {
  const cover = plan.cover;
  if (!cover || !isInvitationMediaPathForEvent(cover.path, cover.eventId, "cover")) return null;
  const extension = cover.path.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png", "webp"].includes(extension)) return null;
  const { data, error } = await createAdminClient().storage.from(INVITATION_MEDIA_BUCKET).download(cover.path);
  if (error || !data) return null;
  try {
    return await sharp(Buffer.from(await data.arrayBuffer()))
      .rotate()
      .resize(SIZE.width, SIZE.height, { fit: "cover" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

function cardImage(plan: InvitationOgPlan): ImageResponse {
  const names = plan.names.slice(0, 80) || "You're invited";
  const detail = plan.detail.slice(0, 160);
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "linear-gradient(145deg, #1A3D24 0%, #14261A 48%, #3C3124 100%)",
          color: "#F3EEE4",
          padding: 72,
        }}
      >
        {plan.brand ? (
          <div style={{ position: "absolute", top: 48, left: 72, display: "flex", fontSize: 28, letterSpacing: 6, color: "#E4C98A" }}>
            INVITESPOT
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: names.length > 28 ? 64 : 84, lineHeight: 1.05 }}>{names}</div>
        {detail ? (
          <div style={{ display: "flex", marginTop: 22, fontSize: 32, lineHeight: 1.3, color: "#E7D7B1" }}>{detail}</div>
        ) : null}
      </div>
    ),
    {
      ...SIZE,
      headers: { "Cache-Control": CACHE, "X-Content-Type-Options": "nosniff" },
    },
  );
}

export function genericInvitationOgPlan(): InvitationOgPlan {
  return { names: "You're invited", detail: "", brand: true, cover: null };
}

export async function renderInvitationOgPlan(plan: InvitationOgPlan): Promise<Response> {
  if (plan.cover) {
    const bytes = await coverPng(plan);
    if (bytes) return pngResponse(bytes);
  }
  return cardImage(plan);
}

export async function invitationOpenGraphResponse(input: {
  slug: string;
  page: "invite" | "memories";
}): Promise<Response> {
  try {
    const invitation = await getPublicInvitationBySlug(input.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    let showBrand = true;
    if (
      input.page === "memories"
      && invitation
      && !invitation.passcodeHash
      && (state === "published" || state === "rsvp_closed")
    ) {
      try {
        const settings = await getEventMemoriesSettings(invitation.event.id);
        if (settings) showBrand = settings.brandingEnabled !== false;
      } catch {
        showBrand = true;
      }
    }
    return renderInvitationOgPlan(invitationOgPlan(invitation, state, { page: input.page, showBrand }));
  } catch {
    return renderInvitationOgPlan(genericInvitationOgPlan());
  }
}

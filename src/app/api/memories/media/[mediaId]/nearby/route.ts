import { NextRequest, NextResponse } from "next/server";
import { getNearbyMedia } from "@/lib/invitations/memories/nearby-media";

export async function GET(_request: NextRequest, { params }: { params: { mediaId: string } }) {
  const nearby = await getNearbyMedia(params.mediaId);
  if (nearby === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ media: nearby });
}

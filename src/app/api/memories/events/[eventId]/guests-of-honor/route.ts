import { NextRequest, NextResponse } from "next/server";
import { getGuestHonorResponse } from "./guest-honor";

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  const result = await getGuestHonorResponse(params.eventId);
  return NextResponse.json(result.body, { status: result.status });
}

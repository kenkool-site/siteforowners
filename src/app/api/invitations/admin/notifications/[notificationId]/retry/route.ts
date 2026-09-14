import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { retryInvitationNotification } from "@/lib/invitations/notifications";

function hasFounderSession(request: NextRequest): boolean {
  return hasFounderInvitationSession(
    process.env.ADMIN_PASSWORD,
    request.cookies.get("admin_session")?.value,
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: { notificationId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  if (!hasFounderSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID_PATTERN.test(params.notificationId)) {
    return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  }

  try {
    const result = await retryInvitationNotification(params.notificationId, request.nextUrl.origin);
    if (!result.ok) {
      if (result.code === "limit_reached") {
        return NextResponse.json(
          { error: "The notification limit for this channel has been reached" },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: "Notification not found or not eligible for retry" },
        { status: 404 },
      );
    }
    return NextResponse.json({ status: result.status });
  } catch (error) {
    console.error("[invitations/admin/notifications/retry] retry failed", {
      notificationId: params.notificationId,
      error,
    });
    return NextResponse.json({ error: "Unable to retry notification" }, { status: 500 });
  }
}

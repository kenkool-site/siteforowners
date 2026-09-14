import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { responsesToCsv } from "@/lib/invitations/csv";
import {
  getInvitationEventForManagement,
  listInvitationResponseRows,
} from "@/lib/invitations/repository";
import { filterSortInvitationResponses } from "@/lib/invitations/responses";

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [event, rows] = await Promise.all([
      getInvitationEventForManagement(params.eventId),
      listInvitationResponseRows(params.eventId),
    ]);
    if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    const query = request.nextUrl.searchParams;
    const responses = filterSortInvitationResponses(rows, {
      status: query.get("status") ?? undefined,
      search: query.get("search") ?? undefined,
      sort: query.get("sort") ?? undefined,
    });
    const csv = responsesToCsv(responses);
    return new NextResponse(csv, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${event.slug}-responses.csv"`,
        "content-type": "text/csv; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[invitations/responses.csv] export failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Responses could not be exported" }, { status: 500 });
  }
}

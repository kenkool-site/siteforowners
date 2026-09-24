import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { createMemoryMoment, deleteMemoryMoment, listMemoryMoments, updateMemoryMoment } from "@/lib/invitations/memories/repository";

const MAX_NAME_LENGTH = 80;

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const moments = await listMemoryMoments(params.eventId);
    return NextResponse.json({ moments });
  } catch (error) {
    console.error("[memories/moments] list failed", { error });
    return NextResponse.json({ error: "failed to list moments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const values = body as { name?: string; startsAt?: string; endsAt?: string; sortOrder?: number };
    const name = values.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
    }
    const startsAtMs = values.startsAt ? Date.parse(values.startsAt) : NaN;
    const endsAtMs = values.endsAt ? Date.parse(values.endsAt) : NaN;
    if (Number.isNaN(startsAtMs) || Number.isNaN(endsAtMs)) {
      return NextResponse.json({ error: "startsAt and endsAt must be valid dates" }, { status: 400 });
    }
    if (endsAtMs <= startsAtMs) {
      return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
    }

    const moment = await createMemoryMoment(params.eventId, {
      name,
      startsAt: new Date(startsAtMs).toISOString(),
      endsAt: new Date(endsAtMs).toISOString(),
      sortOrder: typeof values.sortOrder === "number" ? values.sortOrder : undefined,
    });
    return NextResponse.json({ moment });
  } catch (error) {
    console.error("[memories/moments] create failed", { error });
    return NextResponse.json({ error: "failed to create moment" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const values = body as { id?: unknown; name?: unknown; startsAt?: unknown; endsAt?: unknown; sortOrder?: unknown };
  if (typeof values.id !== "string" || !values.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Format-only validation first, before any database round-trip — matching
  // highlights/route.ts's own update_group ordering (cheap 400s don't need
  // to wait on a DB call, and it keeps this route's validation independently
  // testable without a real moment to fetch).
  const updates: { name?: string; startsAt?: string; endsAt?: string; sortOrder?: number } = {};

  if (values.name !== undefined) {
    if (typeof values.name !== "string" || !values.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const trimmedName = values.name.trim();
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }, { status: 400 });
    }
    updates.name = trimmedName;
  }
  if (values.startsAt !== undefined) {
    const startsAtMs = typeof values.startsAt === "string" ? Date.parse(values.startsAt) : NaN;
    if (Number.isNaN(startsAtMs)) return NextResponse.json({ error: "startsAt must be a valid date" }, { status: 400 });
    updates.startsAt = new Date(startsAtMs).toISOString();
  }
  if (values.endsAt !== undefined) {
    const endsAtMs = typeof values.endsAt === "string" ? Date.parse(values.endsAt) : NaN;
    if (Number.isNaN(endsAtMs)) return NextResponse.json({ error: "endsAt must be a valid date" }, { status: 400 });
    updates.endsAt = new Date(endsAtMs).toISOString();
  }
  if (values.sortOrder !== undefined) {
    if (typeof values.sortOrder !== "number" || !Number.isFinite(values.sortOrder)) {
      return NextResponse.json({ error: "invalid sortOrder" }, { status: 400 });
    }
    updates.sortOrder = values.sortOrder;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no changes provided" }, { status: 400 });
  }

  try {
    // Re-scoped to THIS event's moments specifically — a cross-event id is
    // absent from this list and so is correctly rejected as not found rather
    // than mutated, matching highlights/route.ts's own update_group pattern.
    const moments = await listMemoryMoments(params.eventId);
    const target = moments.find((moment) => moment.id === values.id);
    if (!target) return NextResponse.json({ error: "moment not found" }, { status: 404 });

    // A partial update (e.g. only startsAt) must still be checked against the
    // *effective* window, not just the field(s) actually sent — otherwise a
    // one-field edit could silently invert an existing moment's window.
    const effectiveStartsAt = Date.parse(updates.startsAt ?? target.startsAt);
    const effectiveEndsAt = Date.parse(updates.endsAt ?? target.endsAt);
    if (effectiveEndsAt <= effectiveStartsAt) {
      return NextResponse.json({ error: "endsAt must be after startsAt" }, { status: 400 });
    }

    await updateMemoryMoment(params.eventId, target.id, updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories/moments] update failed", { error });
    return NextResponse.json({ error: "failed to update moment" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const values = body as { id?: unknown };
  if (typeof values.id !== "string" || !values.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const moments = await listMemoryMoments(params.eventId);
    const target = moments.find((moment) => moment.id === values.id);
    if (!target) return NextResponse.json({ error: "moment not found" }, { status: 404 });

    await deleteMemoryMoment(params.eventId, target.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories/moments] delete failed", { error });
    return NextResponse.json({ error: "failed to delete moment" }, { status: 500 });
  }
}

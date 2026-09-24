import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { requestHighlightGeneration } from "@/lib/invitations/memories/highlight-service";
import {
  createMemoryHighlightGroup,
  deleteMemoryHighlightGroup,
  getHostHighlightsOverview,
  listMemoryHighlightGroups,
  updateEventHighlightMode,
  updateMemoryHighlightGroup,
} from "@/lib/invitations/memories/repository";
import {
  findHostDefinedGroup,
  isValidHighlightMode,
  isValidSortOrder,
  validateGroupDescription,
  validateGroupName,
} from "./highlight-validation";

// GET has no same-origin check, matching moments/route.ts's own GET — reads
// are safe, only writes need the cross-origin guard.
export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const actor = await requireInvitationAccess(request, params.eventId);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const overview = await getHostHighlightsOverview(params.eventId);
    if (!overview) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(overview);
  } catch (error) {
    console.error("[memories/highlights] list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "failed to load highlights" }, { status: 500 });
  }
}

// Creates one host-defined group. semanticKey is a fresh random id, not
// derived from the name: unlike automatic/fallback groups (whose semanticKey
// is a stable slug the classifier re-matches across regenerations), a host
// can legitimately create two groups with the same name, and
// (event_id, source, semantic_key) is a hard DB uniqueness constraint — a
// name-derived slug would collide on the second one.
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

  const values = body as { name?: unknown; description?: unknown; sortOrder?: unknown };

  const name = validateGroupName(values.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });

  const description = validateGroupDescription(values.description);
  if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 });

  const rawSortOrder = values.sortOrder ?? 0;
  if (!isValidSortOrder(rawSortOrder)) {
    return NextResponse.json({ error: "invalid sortOrder" }, { status: 400 });
  }

  try {
    const group = await createMemoryHighlightGroup(params.eventId, {
      name: name.value,
      description: description.value,
      semanticKey: randomUUID(),
      source: "host_defined",
      sortOrder: rawSortOrder,
      isVisible: true,
    });
    return NextResponse.json({ group: { ...group, mediaCount: 0 } });
  } catch (error) {
    console.error("[memories/highlights] create failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "failed to create highlight group" }, { status: 500 });
  }
}

// Two independent write shapes dispatched by `action`, matching the
// settings/route.ts PATCH convention:
//   { action: "set_mode", mode }
//   { action: "update_group", id, name?, description?, sortOrder?, isVisible? }
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

  const values = body as {
    action?: string;
    mode?: unknown;
    id?: unknown;
    name?: unknown;
    description?: unknown;
    sortOrder?: unknown;
    isVisible?: unknown;
  };

  if (values.action === "set_mode") {
    const mode = values.mode;
    if (!isValidHighlightMode(mode)) {
      return NextResponse.json({ error: "invalid mode" }, { status: 400 });
    }

    try {
      await updateEventHighlightMode(params.eventId, mode);
    } catch (error) {
      console.error("[memories/highlights] mode update failed", { eventId: params.eventId, error });
      return NextResponse.json({ error: "failed to update highlight mode" }, { status: 500 });
    }

    // Only after the settings write above has succeeded: a mode switch
    // opportunistically kicks off a generation in the new mode. force: true
    // so it isn't blocked by "not enough new media yet" — the host just
    // changed how groups are made and reasonably expects a fresh attempt.
    // Best-effort, matching moderation/route.ts's own treatment of this same
    // call: a queueing hiccup here must never turn an otherwise-successful
    // mode switch into a failure response — the host can still hit
    // Generate/Regenerate manually.
    try {
      await requestHighlightGeneration(params.eventId, true);
    } catch (error) {
      console.error("[memories/highlights] failed to queue generation after mode switch (non-fatal)", {
        eventId: params.eventId,
        error,
      });
    }

    return NextResponse.json({ ok: true });
  }

  if (values.action === "update_group") {
    const id = values.id;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: { name?: string; description?: string | null; sortOrder?: number; isVisible?: boolean } = {};

    if (values.name !== undefined) {
      const name = validateGroupName(values.name);
      if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
      updates.name = name.value;
    }
    if (values.description !== undefined) {
      const description = validateGroupDescription(values.description);
      if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 });
      updates.description = description.value;
    }
    if (values.sortOrder !== undefined) {
      if (!isValidSortOrder(values.sortOrder)) {
        return NextResponse.json({ error: "invalid sortOrder" }, { status: 400 });
      }
      updates.sortOrder = values.sortOrder;
    }
    if (values.isVisible !== undefined) {
      if (typeof values.isVisible !== "boolean") {
        return NextResponse.json({ error: "invalid isVisible" }, { status: 400 });
      }
      updates.isVisible = values.isVisible;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "no changes provided" }, { status: 400 });
    }

    try {
      // Re-scoped to THIS event's host_defined groups specifically (not just
      // "does a group with this id exist anywhere") — a cross-event id, or a
      // same-event automatic/fallback group id, is absent from this list and
      // so is correctly rejected as not found rather than mutated.
      const groups = await listMemoryHighlightGroups(params.eventId, "host_defined");
      const target = findHostDefinedGroup(groups, id);
      if (!target) return NextResponse.json({ error: "group not found" }, { status: 404 });

      await updateMemoryHighlightGroup(params.eventId, target.id, updates);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[memories/highlights] group update failed", { eventId: params.eventId, error });
      return NextResponse.json({ error: "failed to update highlight group" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
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
    // Same re-scoping as update_group above — see that comment.
    const groups = await listMemoryHighlightGroups(params.eventId, "host_defined");
    const target = findHostDefinedGroup(groups, values.id);
    if (!target) return NextResponse.json({ error: "group not found" }, { status: 404 });

    await deleteMemoryHighlightGroup(params.eventId, target.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories/highlights] delete failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "failed to delete highlight group" }, { status: 500 });
  }
}

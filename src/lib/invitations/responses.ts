import type {
  InvitationEventStatus,
  InvitationNotificationChannel,
  InvitationNotificationStatus,
  RsvpSummary,
} from "./types";

export type InvitationResponseStatusFilter = "all" | "attending" | "declined";
export type InvitationResponseSort = "newest" | "oldest" | "name";

export type InvitationResponseQuery = {
  status: InvitationResponseStatusFilter;
  search: string;
  sort: InvitationResponseSort;
  page: number;
  perPage: number;
};

export type InvitationResponseRow = {
  id: string;
  event_id: string;
  primary_name: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  party_size: number;
  additional_guest_names: string[];
  dietary_or_accessibility_notes: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type InvitationNotificationWarningRow = {
  id: string;
  channel: InvitationNotificationChannel;
  status: InvitationNotificationStatus;
};

export type InvitationResponse = {
  id: string;
  eventId: string;
  primaryName: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  partySize: number;
  additionalGuestNames: string[];
  dietaryOrAccessibilityNotes: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvitationDashboardWarningCode =
  | "deadline_reached"
  | "capacity_reached"
  | "email_limit_reached"
  | "sms_limit_reached"
  | "failed_delivery"
  | "expired"
  | "offline";

export type InvitationDashboardWarning = {
  code: InvitationDashboardWarningCode;
  count: number;
};

export type InvitationResponsesDashboard = {
  responses: InvitationResponse[];
  filteredTotal: number;
  page: number;
  perPage: number;
  summary: RsvpSummary;
  notificationWarningCount: number;
  warnings: InvitationDashboardWarning[];
  failedNotifications: Array<{ id: string; channel: InvitationNotificationChannel }>;
};

export type InvitationResponsesEventRow = {
  status: InvitationEventStatus;
  capacity: number | null;
  rsvp_deadline: string | null;
  expire_at: string | null;
  email_notification_limit: number;
  sms_notification_limit: number;
};

export type AdministrativeRsvpAuditMetadata = {
  eventId: string;
  rsvpId: string;
  actor: "founder" | "owner";
  ownerId?: string;
  attending: boolean;
  partySize: number;
  updatedAt: string;
};

export function administrativeRsvpAuditMetadata(
  input: AdministrativeRsvpAuditMetadata & { privateResponse?: unknown },
): AdministrativeRsvpAuditMetadata {
  return {
    eventId: input.eventId,
    rsvpId: input.rsvpId,
    actor: input.actor,
    ...(input.ownerId ? { ownerId: input.ownerId } : {}),
    attending: input.attending,
    partySize: input.partySize,
    updatedAt: input.updatedAt,
  };
}

type RawQuery = Partial<Record<keyof InvitationResponseQuery, string | number>>;

function positiveInteger(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeInvitationResponseQuery(query: RawQuery): InvitationResponseQuery {
  const status = query.status === "attending" || query.status === "declined" ? query.status : "all";
  const sort = query.sort === "oldest" || query.sort === "name" ? query.sort : "newest";
  return {
    status,
    search: typeof query.search === "string" ? query.search.trim().slice(0, 120) : "",
    sort,
    page: positiveInteger(query.page, 1),
    perPage: Math.min(positiveInteger(query.perPage, 25), 100),
  };
}

function projectResponse(row: InvitationResponseRow): InvitationResponse {
  return {
    id: row.id,
    eventId: row.event_id,
    primaryName: row.primary_name,
    email: row.email,
    phone: row.phone,
    attending: row.attending,
    partySize: row.party_size,
    additionalGuestNames: row.additional_guest_names,
    dietaryOrAccessibilityNotes: row.dietary_or_accessibility_notes,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function includesSearch(row: InvitationResponseRow, search: string): boolean {
  if (!search) return true;
  const needle = search.toLocaleLowerCase();
  return [
    row.primary_name,
    row.email,
    row.phone,
    ...row.additional_guest_names,
    row.dietary_or_accessibility_notes,
    row.message,
  ].some((value) => value?.toLocaleLowerCase().includes(needle));
}

function compareResponses(sort: InvitationResponseSort) {
  const names = new Intl.Collator(undefined, { sensitivity: "base" });
  return (left: InvitationResponseRow, right: InvitationResponseRow): number => {
    if (sort === "name") {
      const byName = names.compare(left.primary_name, right.primary_name);
      return byName || left.id.localeCompare(right.id);
    }
    const byCreated = Date.parse(left.created_at) - Date.parse(right.created_at);
    const stable = byCreated || left.id.localeCompare(right.id);
    return sort === "oldest" ? stable : -stable;
  };
}

export function filterSortInvitationResponses(
  rows: readonly InvitationResponseRow[],
  rawQuery: RawQuery,
): InvitationResponse[] {
  const query = normalizeInvitationResponseQuery(rawQuery);
  return rows
    .filter((row) => query.status === "all" || row.attending === (query.status === "attending"))
    .filter((row) => includesSearch(row, query.search))
    .sort(compareResponses(query.sort))
    .map(projectResponse);
}

function notificationUsage(
  notifications: readonly InvitationNotificationWarningRow[],
  channel: InvitationNotificationChannel,
): number {
  return notifications.filter((row) => row.channel === channel && row.status !== "suppressed").length;
}

export function buildInvitationResponsesDashboard(input: {
  event: InvitationResponsesEventRow;
  rows: readonly InvitationResponseRow[];
  notifications: readonly InvitationNotificationWarningRow[];
  query: RawQuery;
  now?: Date;
}): InvitationResponsesDashboard {
  const query = normalizeInvitationResponseQuery(input.query);
  const attendingPeople = input.rows.reduce((total, row) => total + (row.attending ? row.party_size : 0), 0);
  const summary: RsvpSummary = {
    attendingPeople,
    attendingParties: input.rows.filter((row) => row.attending).length,
    declinedParties: input.rows.filter((row) => !row.attending).length,
    remainingCapacity: input.event.capacity === null
      ? null
      : Math.max(0, input.event.capacity - attendingPeople),
    totalSubmissions: input.rows.length,
  };
  const filtered = filterSortInvitationResponses(input.rows, query);
  const totalPages = Math.max(1, Math.ceil(filtered.length / query.perPage));
  const page = Math.min(query.page, totalPages);
  const start = (page - 1) * query.perPage;
  const failed = input.notifications.filter((row) => row.status === "failed");
  const suppressed = input.notifications.filter((row) => row.status === "suppressed");
  const now = (input.now ?? new Date()).getTime();
  const warnings: InvitationDashboardWarning[] = [];
  const expired = input.event.status === "expired"
    || (input.event.expire_at !== null && Date.parse(input.event.expire_at) <= now);
  if (!expired && input.event.status !== "offline" && input.event.rsvp_deadline && Date.parse(input.event.rsvp_deadline) <= now) {
    warnings.push({ code: "deadline_reached", count: 1 });
  }
  if (input.event.capacity !== null && summary.remainingCapacity === 0) {
    warnings.push({ code: "capacity_reached", count: 1 });
  }
  if (
    notificationUsage(input.notifications, "email") >= input.event.email_notification_limit
    || suppressed.some((row) => row.channel === "email")
  ) warnings.push({ code: "email_limit_reached", count: 1 });
  if (
    notificationUsage(input.notifications, "sms") >= input.event.sms_notification_limit
    || suppressed.some((row) => row.channel === "sms")
  ) warnings.push({ code: "sms_limit_reached", count: 1 });
  if (failed.length) warnings.push({ code: "failed_delivery", count: failed.length });
  if (expired) warnings.push({ code: "expired", count: 1 });
  if (input.event.status === "offline") warnings.push({ code: "offline", count: 1 });

  return {
    responses: filtered.slice(start, start + query.perPage),
    filteredTotal: filtered.length,
    page,
    perPage: query.perPage,
    summary,
    notificationWarningCount: failed.length + suppressed.length,
    warnings,
    failedNotifications: failed.map((row) => ({ id: row.id, channel: row.channel })),
  };
}

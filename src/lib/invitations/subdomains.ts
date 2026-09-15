import { normalizePlatformSubdomain, validatePlatformSubdomain } from "@/lib/subdomain";

export type PlatformSubdomainReservation = {
  tenantId?: string | null;
  invitationEventId?: string | null;
};

export type InvitationSubdomainRepository = {
  findReservation(label: string): Promise<PlatformSubdomainReservation | null>;
};

export type InvitationSubdomainAvailability = {
  available: boolean;
  normalized: string;
  suggestion: string;
};

export function isPlatformSubdomainTakenError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes("PLATFORM_SUBDOMAIN_TAKEN")) return true;
  return isPlatformSubdomainTakenError(error.cause);
}

function candidateFor(base: string, suffix: number): string {
  if (suffix === 1) return base;
  const tag = `-${suffix}`;
  return `${base.slice(0, 40 - tag.length)}${tag}`;
}

export async function findAvailableInvitationSubdomain(
  requested: string,
  currentEventId: string | null,
  repository: InvitationSubdomainRepository,
): Promise<InvitationSubdomainAvailability> {
  const normalized = normalizePlatformSubdomain(requested);
  const validation = validatePlatformSubdomain(requested);
  const base = validation.ok ? validation.value : `${normalized || "event"}-event`.slice(0, 40);

  for (let suffix = 1; suffix <= 9999; suffix++) {
    const candidate = candidateFor(base, suffix);
    const reservation = await repository.findReservation(candidate);
    const isOwnReservation = reservation?.invitationEventId === currentEventId;
    if (!reservation || isOwnReservation) {
      return {
        available: validation.ok && suffix === 1,
        normalized,
        suggestion: candidate,
      };
    }
  }
  throw new Error("No invitation subdomain is available");
}

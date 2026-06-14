export interface ChecklistItem {
  id: string;
  label: string;
}

/** Read-only items derived from data the admin page already has. */
export const AUTO_ITEMS: ChecklistItem[] = [
  { id: "live", label: "Client is live (paid)" },
  { id: "domain", label: "Custom domain or subdomain configured" },
  { id: "locality", label: "Local SEO area set" },
];

/** Items the founder ticks off manually; completion is persisted. */
export const MANUAL_ITEMS: ChecklistItem[] = [
  { id: "hours_services", label: "Hours & services verified" },
  { id: "social", label: "Social links added" },
  { id: "gbp_created", label: "Google Business Profile created & verified" },
  { id: "gbp_nap", label: "GBP info matches website (NAP)" },
  { id: "gbp_website", label: "GBP website link points to live site" },
  { id: "reviews", label: "Review collection started" },
  { id: "gsc_sitemap", label: "Sitemap submitted to Search Console" },
  { id: "gsc_index", label: "Requested indexing in Search Console" },
];

const MANUAL_IDS = new Set(MANUAL_ITEMS.map((i) => i.id));

/** Stored shape: manual item id -> ISO timestamp of completion. */
export type ManualState = Record<string, string | undefined>;

export interface AutoDeriveInput {
  isDemo: boolean;
  customDomain: string | null;
  subdomain: string | null;
  seoLocality: string | null;
}

export function isManualItemId(id: string): boolean {
  return MANUAL_IDS.has(id);
}

/** Completion of each auto item, keyed by item id. */
export function deriveAuto(input: AutoDeriveInput): Record<string, boolean> {
  return {
    live: !input.isDemo,
    domain: !!(input.customDomain || input.subdomain),
    locality: !!input.seoLocality?.trim(),
  };
}

export function computeProgress(
  autoState: Record<string, boolean>,
  manualState: ManualState,
): { done: number; total: number } {
  const autoDone = AUTO_ITEMS.filter((i) => autoState[i.id]).length;
  const manualDone = MANUAL_ITEMS.filter((i) => !!manualState[i.id]).length;
  return { done: autoDone + manualDone, total: AUTO_ITEMS.length + MANUAL_ITEMS.length };
}

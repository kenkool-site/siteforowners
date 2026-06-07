export const BUSINESS_TYPES = [
  "Braids",
  "Locs",
  "Haircuts",
  "Nails",
  "Salon",
  "Hair",
  "Lashes / brows",
  "Barber / grooming",
  "Spa / skincare",
  "Other beauty business",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];
export type LeadSource = "homepage" | "demo";

export type MarketingLeadStatus = "new" | "contacted" | "archived";

export interface MarketingLeadRow {
  id: string;
  business_name: string;
  email: string;
  phone: string;
  business_address: string | null;
  business_type: string;
  booking_url: string | null;
  instagram_url: string | null;
  notes: string | null;
  source: string;
  status: MarketingLeadStatus;
  preview_group_id: string | null;
  created_at: string;
}

export type MarketingLead = {
  businessName: string;
  email: string;
  phone: string;
  businessAddress: string;
  businessType: BusinessType;
  bookingUrl: string;
  instagramUrl: string;
  notes: string;
  source: LeadSource;
};

type ParseResult =
  | { ok: true; value: MarketingLead }
  | { ok: false; error: string };

function cleanString(value: unknown, maxLength = 240): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isBusinessType(value: string): value is BusinessType {
  return BUSINESS_TYPES.includes(value as BusinessType);
}

function parseSource(value: string): LeadSource {
  return value === "demo" ? "demo" : "homepage";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Wizard business types (src/app/(marketing)/preview/page.tsx). There is no
// "locs" wizard type — loc businesses use the braids template/services.
export type WizardBusinessType =
  | "salon"
  | "barbershop"
  | "restaurant"
  | "nails"
  | "braids";

const MARKETING_TO_WIZARD_TYPE: Record<BusinessType, WizardBusinessType | ""> = {
  Braids: "braids",
  Locs: "braids",
  Haircuts: "salon",
  Nails: "nails",
  Salon: "salon",
  Hair: "salon",
  "Lashes / brows": "",
  "Barber / grooming": "barbershop",
  "Spa / skincare": "",
  "Other beauty business": "",
};

export function mapMarketingTypeToWizardType(
  type: string,
): WizardBusinessType | "" {
  return (MARKETING_TO_WIZARD_TYPE as Record<string, WizardBusinessType | "">)[
    type
  ] ?? "";
}

export function buildWizardPrefillUrl(lead: {
  id: string;
  business_name: string;
  business_type: string;
  phone: string;
  business_address?: string | null;
  booking_url?: string | null;
  instagram_url?: string | null;
  notes?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("lead", lead.id);
  if (lead.business_name) params.set("name", lead.business_name);
  const wizardType = mapMarketingTypeToWizardType(lead.business_type);
  if (wizardType) params.set("type", wizardType);
  if (lead.phone) params.set("phone", lead.phone);
  if (lead.business_address) params.set("address", lead.business_address);
  if (lead.booking_url) params.set("link", lead.booking_url);
  if (lead.instagram_url) params.set("instagram", lead.instagram_url);
  if (lead.notes) params.set("desc", lead.notes);
  return `/preview?${params.toString()}`;
}

// Render-time href builders. Stored values keep their raw form (handles, etc.);
// these only run when we need a clickable link (admin email, detail modal).
export function instagramHref(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/instagram\.com/i.test(v)) return `https://${v.replace(/^\/+/, "")}`;
  return `https://instagram.com/${v.replace(/^@+/, "")}`;
}

export function externalHref(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

export function parseMarketingLead(body: unknown): ParseResult {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessName = cleanString(data.businessName);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone);
  const businessAddress = cleanString(data.businessAddress);
  const businessType = cleanString(data.businessType);
  const bookingUrl = cleanString(data.bookingUrl, 500);
  const instagramUrl = cleanString(data.instagramUrl, 500);
  const notes = cleanString(data.notes, 1200);
  const source = parseSource(cleanString(data.source, 40));

  if (!businessName || !email || !phone || !isBusinessType(businessType)) {
    return {
      ok: false,
      error: "Business name, email, phone, and business type are required.",
    };
  }

  return {
    ok: true,
    value: {
      businessName,
      email,
      phone,
      businessAddress,
      businessType,
      bookingUrl,
      instagramUrl,
      notes,
      source,
    },
  };
}

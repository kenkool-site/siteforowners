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

export type MarketingLead = {
  businessName: string;
  email: string;
  phone: string;
  businessAddress: string;
  businessType: BusinessType;
  businessLink: string;
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

export function parseMarketingLead(body: unknown): ParseResult {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const businessName = cleanString(data.businessName);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone);
  const businessAddress = cleanString(data.businessAddress);
  const businessType = cleanString(data.businessType);
  const businessLink = cleanString(data.businessLink, 500);
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
      businessLink,
      notes,
      source,
    },
  };
}

import type { HomeServicesLocale } from "./types";

export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.length === 10 ? `1${digits}` : digits;
  return normalized.length >= 11 && normalized.length <= 15 ? `+${normalized}` : null;
}

export function buildTelHref(raw: string): string | null {
  const phone = normalizeE164(raw);
  return phone ? `tel:${phone}` : null;
}

export function buildSmsHref(raw: string, body?: string): string | null {
  const phone = normalizeE164(raw);
  return phone ? `sms:${phone}${body ? `?body=${encodeURIComponent(body)}` : ""}` : null;
}

export function buildWhatsAppHref(raw: string, body?: string): string | null {
  const phone = normalizeE164(raw);
  return phone
    ? `https://wa.me/${phone.slice(1)}${body ? `?text=${encodeURIComponent(body)}` : ""}`
    : null;
}

export function homepagePath(locale: HomeServicesLocale): "/" | "/es" {
  return locale === "es" ? "/es" : "/";
}

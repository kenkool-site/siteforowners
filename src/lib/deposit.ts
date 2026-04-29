
/**
 * Parses a service price string into a dollar amount. Strips currency
 * symbols, commas, and surrounding text. Returns 0 for un-parseable
 * inputs (e.g. "Free", "Call for quote", empty string).
 */
export function parseServicePrice(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export interface DepositSettings {
  deposit_required: boolean;
  deposit_mode?: "fixed" | "percent" | null;
  deposit_value?: number | null;
}

/**
 * Server-authoritative deposit calculation. Returns 0 when deposit
 * is not required. Fixed mode returns the flat dollar amount. Percent
 * mode applies the percentage to (basePrice + addOnTotal) rounded to
 * cents. Percent mode falls back to treating deposit_value as a flat
 * dollar amount when basePrice is 0 (unparseable upstream price like
 * "Free" or "From $X").
 */
export function computeDeposit(
  settings: DepositSettings,
  basePrice: number,
  addOnTotal: number,
): number {
  if (!settings.deposit_required) return 0;
  const value = settings.deposit_value ?? 0;
  if (value <= 0) return 0;
  if (settings.deposit_mode === "fixed") {
    return value;
  }
  // percent mode
  const total = basePrice + addOnTotal;
  if (total <= 0) {
    // Unparseable upstream price — fall back to fixed-dollar interpretation.
    return value;
  }
  const raw = total * (value / 100);
  return Math.round(raw * 100) / 100;
}

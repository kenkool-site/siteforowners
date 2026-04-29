import { normalizeCashapp } from "@/lib/deposit-payment-methods";

export interface DepositSettingsInput {
  deposit_required?: boolean;
  deposit_mode?: "fixed" | "percent" | null;
  deposit_value?: number | null;
  deposit_cashapp?: string | null;
  deposit_zelle?: string | null;
  deposit_other_label?: string | null;
  deposit_other_value?: string | null;
}

export interface DepositSettingsValue {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_cashapp: string | null;
  deposit_zelle: string | null;
  deposit_other_label: string | null;
  deposit_other_value: string | null;
}

export interface DepositSettingsValidationError {
  field: string;
  reason: string;
}

export type DepositSettingsValidationResult =
  | { ok: true; value: DepositSettingsValue }
  | { ok: false; errors: DepositSettingsValidationError[] };

const MAX_HANDLE_LEN = 100;
const CASHTAG_RE = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, MAX_HANDLE_LEN);
}

export function validateDepositSettings(
  input: DepositSettingsInput,
): DepositSettingsValidationResult {
  const required = input.deposit_required === true;

  if (!required) {
    // Toggle off → wipe everything so stale handles don't leak in if the
    // owner re-enables later.
    return {
      ok: true,
      value: {
        deposit_required: false,
        deposit_mode: null,
        deposit_value: null,
        deposit_cashapp: null,
        deposit_zelle: null,
        deposit_other_label: null,
        deposit_other_value: null,
      },
    };
  }

  const errors: DepositSettingsValidationError[] = [];
  const mode = input.deposit_mode;
  const value = input.deposit_value;

  if (mode !== "fixed" && mode !== "percent") {
    errors.push({ field: "deposit_mode", reason: "must be 'fixed' or 'percent'" });
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push({ field: "deposit_value", reason: "required" });
  } else if (mode === "fixed") {
    if (value <= 0) {
      errors.push({ field: "deposit_value", reason: "must be greater than 0" });
    }
  } else if (mode === "percent") {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      errors.push({ field: "deposit_value", reason: "must be an integer between 1 and 100" });
    }
  }

  // Payment methods. Stored bare; UI/email prepend the $ for cashtags.
  const cashappRaw = trimOrNull(input.deposit_cashapp);
  const cashapp = cashappRaw ? normalizeCashapp(cashappRaw) : null;
  if (cashapp && !CASHTAG_RE.test(cashapp)) {
    errors.push({
      field: "deposit_cashapp",
      reason: "must start with a letter and contain only letters, numbers, and underscores (max 20)",
    });
  }

  const zelle = trimOrNull(input.deposit_zelle);

  const otherLabelRaw = trimOrNull(input.deposit_other_label);
  const otherValueRaw = trimOrNull(input.deposit_other_value);
  // Other is paired — if either side is set, both must be.
  if ((otherLabelRaw && !otherValueRaw) || (!otherLabelRaw && otherValueRaw)) {
    errors.push({
      field: "deposit_other",
      reason: "label and value must both be set, or both blank",
    });
  }

  // Require at least one method so the customer knows how to pay.
  const hasAny = Boolean(cashapp || zelle || (otherLabelRaw && otherValueRaw));
  if (!hasAny) {
    errors.push({
      field: "deposit_payment_methods",
      reason: "at least one payment method is required (CashApp, Zelle, or Other)",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      deposit_required: true,
      deposit_mode: mode as "fixed" | "percent",
      deposit_value: value as number,
      deposit_cashapp: cashapp || null,
      deposit_zelle: zelle,
      deposit_other_label: otherLabelRaw && otherValueRaw ? otherLabelRaw : null,
      deposit_other_value: otherLabelRaw && otherValueRaw ? otherValueRaw : null,
    },
  };
}

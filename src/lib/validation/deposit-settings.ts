export interface DepositSettingsInput {
  deposit_required?: boolean;
  deposit_mode?: "fixed" | "percent" | null;
  deposit_value?: number | null;
  deposit_instructions?: string | null;
}

export interface DepositSettingsValue {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_instructions: string | null;
}

export interface DepositSettingsValidationError {
  field: string;
  reason: string;
}

export type DepositSettingsValidationResult =
  | { ok: true; value: DepositSettingsValue }
  | { ok: false; errors: DepositSettingsValidationError[] };

const MAX_INSTRUCTIONS = 1000;

export function validateDepositSettings(
  input: DepositSettingsInput,
): DepositSettingsValidationResult {
  const required = input.deposit_required === true;

  if (!required) {
    // When toggle is off, clear all related fields.
    return {
      ok: true,
      value: {
        deposit_required: false,
        deposit_mode: null,
        deposit_value: null,
        deposit_instructions: null,
      },
    };
  }

  const errors: DepositSettingsValidationError[] = [];
  const mode = input.deposit_mode;
  const value = input.deposit_value;
  const instructionsRaw = input.deposit_instructions;

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

  const instructions = typeof instructionsRaw === "string" ? instructionsRaw.trim() : "";
  if (instructions.length === 0) {
    errors.push({ field: "deposit_instructions", reason: "required" });
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      deposit_required: true,
      deposit_mode: mode as "fixed" | "percent",
      deposit_value: value as number,
      deposit_instructions: instructions.slice(0, MAX_INSTRUCTIONS),
    },
  };
}

import { parseHomeServicesConfig, type HomeServicesConfig } from "./types";

export type HomeServicesEditorError = { field: string; reason: string };
export type HomeServicesEditorValidation =
  | { ok: true; value: HomeServicesConfig }
  | { ok: false; errors: HomeServicesEditorError[] };

const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/;
const PROCESS_FIELDS = ["id", "title_en", "body_en", "title_es", "body_es"] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const trimmedString = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export function parseZipInput(value: string): string[] {
  return value.split(/[\n,]/).map((zip) => zip.trim()).filter(Boolean);
}

export function validateHomeServicesEditorConfig(raw: unknown): HomeServicesEditorValidation {
  const errors: HomeServicesEditorError[] = [];
  const source = record(raw);
  if (!source) return { ok: false, errors: [{ field: "config", reason: "Configuration must be an object." }] };

  const processRows = source.process_steps;
  if (processRows !== undefined && !Array.isArray(processRows)) {
    errors.push({ field: "process_steps", reason: "Process steps must be a list." });
  } else if (Array.isArray(processRows)) {
    if (processRows.length > 3) errors.push({ field: "process_steps", reason: "Add no more than 3 process steps." });
    processRows.forEach((value, index) => {
      const row = record(value);
      if (!row) {
        errors.push({ field: `process_steps.${index}`, reason: "Process step must be a complete row." });
        return;
      }
      for (const field of PROCESS_FIELDS) {
        if (!trimmedString(row[field])) {
          errors.push({ field: `process_steps.${index}.${field}`, reason: "This bilingual process field is required." });
        }
      }
    });
  }

  const areaRows = source.service_areas;
  const names = new Set<string>();
  const zips = new Set<string>();
  if (areaRows !== undefined && !Array.isArray(areaRows)) {
    errors.push({ field: "service_areas", reason: "Service areas must be a list." });
  } else if (Array.isArray(areaRows)) {
    if (areaRows.length > 20) errors.push({ field: "service_areas", reason: "Add no more than 20 service areas." });
    areaRows.forEach((value, index) => {
      const row = record(value);
      if (!row) {
        errors.push({ field: `service_areas.${index}`, reason: "Service area must be a complete row." });
        return;
      }
      if (!trimmedString(row.id)) errors.push({ field: `service_areas.${index}.id`, reason: "Service area ID is required." });
      const name = trimmedString(row.name);
      const normalizedName = name.toLocaleLowerCase();
      if (!name) {
        errors.push({ field: `service_areas.${index}.name`, reason: "Service area name is required." });
      } else if (names.has(normalizedName)) {
        errors.push({ field: `service_areas.${index}.name`, reason: "Service area names must be unique." });
      } else {
        names.add(normalizedName);
      }

      if (!Array.isArray(row.zip_codes)) {
        errors.push({ field: `service_areas.${index}.zip_codes`, reason: "ZIP codes must be a list." });
        return;
      }
      if (row.zip_codes.length > 10) {
        errors.push({ field: `service_areas.${index}.zip_codes`, reason: "Add no more than 10 ZIP codes per service area." });
      }
      for (const rawZip of row.zip_codes) {
        const zip = trimmedString(rawZip);
        if (!ZIP_PATTERN.test(zip)) {
          errors.push({ field: `service_areas.${index}.zip_codes`, reason: `Invalid ZIP code: ${zip || "empty value"}.` });
        } else if (zips.has(zip)) {
          errors.push({ field: `service_areas.${index}.zip_codes`, reason: `ZIP code ${zip} is already used.` });
        } else {
          zips.add(zip);
        }
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, value: parseHomeServicesConfig(source) };
}

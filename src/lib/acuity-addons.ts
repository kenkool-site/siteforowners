import type { AddOn } from "@/lib/ai/types";

/**
 * One entry of Acuity's embedded `BUSINESS.addons` array. Acuity exposes
 * add-ons (the "Add to appointment" extras) as a flat list, and each
 * appointment type references them by id via `addonIDs`.
 */
export interface AcuityAddon {
  id: number;
  name: string;
  duration: number; // minutes
  price: string | number; // e.g. "110.00"
  active?: boolean;
  private?: boolean; // admin-only add-on, not shown to customers
}

// Mirror the platform's add-on rules (src/lib/validation/add-ons.ts) so imported
// values persist into previews.services[].add_ons without re-validation.
const MAX_ADD_ONS = 10;
const MAX_NAME_LENGTH = 80;
const DURATION_STEP = 5;

/** Index `BUSINESS.addons` by id for O(1) lookup from an appointment type's addonIDs. */
export function buildAcuityAddonMap(rawAddons: unknown): Map<number, AcuityAddon> {
  const map = new Map<number, AcuityAddon>();
  if (!Array.isArray(rawAddons)) return map;
  for (const entry of rawAddons) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const id = Number(r.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      id,
      name: typeof r.name === "string" ? r.name : "",
      duration: Number(r.duration),
      price:
        typeof r.price === "string" || typeof r.price === "number" ? r.price : 0,
      active: typeof r.active === "boolean" ? r.active : undefined,
      private: typeof r.private === "boolean" ? r.private : undefined,
    });
  }
  return map;
}

/**
 * Resolve an appointment type's `addonIDs` to platform `AddOn[]`. Skips
 * inactive/private (admin-only) add-ons, trims and caps the name, coerces the
 * price to a non-negative number, snaps the duration to a multiple of 5
 * minutes, dedupes by name (case-insensitive), and caps the list at 10 —
 * matching `validateAddOns` so the result is already store-ready.
 */
export function acuityAddOnsForService(
  addonIDs: unknown,
  addonMap: Map<number, AcuityAddon>,
): AddOn[] {
  if (!Array.isArray(addonIDs)) return [];
  const out: AddOn[] = [];
  const seen = new Set<string>();
  for (const rawId of addonIDs) {
    if (out.length >= MAX_ADD_ONS) break;
    const addon = addonMap.get(Number(rawId));
    if (!addon) continue;
    if (addon.active === false || addon.private === true) continue;

    const name = addon.name.trim().slice(0, MAX_NAME_LENGTH);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    const price =
      typeof addon.price === "number" ? addon.price : parseFloat(String(addon.price));
    if (!Number.isFinite(price) || price < 0) continue;

    const durationRaw = Number.isFinite(addon.duration) ? addon.duration : 0;
    const duration = Math.max(0, Math.round(durationRaw / DURATION_STEP) * DURATION_STEP);

    seen.add(key);
    out.push({ name, price_delta: price, duration_delta_minutes: duration });
  }
  return out;
}

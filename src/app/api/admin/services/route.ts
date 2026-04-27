import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem, AddOn } from "@/lib/ai/types";
import { validateCategories } from "@/lib/validation/categories";
import { validateAddOns } from "@/lib/validation/add-ons";

const MAX_NAME = 80;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 1000;

function imageOriginAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!supabaseUrl) return false;
    const expected = new URL(supabaseUrl);
    return u.origin === expected.origin && u.pathname.startsWith("/storage/v1/object/public/service-images/");
  } catch {
    return false;
  }
}

interface ValidationError {
  index: number;
  field: string;
  reason: string;
}

interface ValidationOk {
  ok: true;
  services: ServiceItem[];
  categories: string[];
}
interface ValidationFail {
  ok: false;
  errors: ValidationError[];
}

function validatePayload(body: Record<string, unknown>): ValidationOk | ValidationFail {
  const errors: ValidationError[] = [];

  // Categories first — service.category validation depends on the parsed list.
  const catResult = validateCategories(body.categories);
  if (!catResult.ok) {
    catResult.errors.forEach((e) => errors.push({ index: -1, field: e.field, reason: e.reason }));
  }
  const categories: string[] = catResult.ok ? catResult.value : [];
  const categorySet = new Set(categories);

  const rawServices = body.services;
  if (!Array.isArray(rawServices)) {
    errors.push({ index: -1, field: "services", reason: "must be an array" });
    return { ok: false, errors };
  }

  const services: ServiceItem[] = [];
  rawServices.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ index, field: "service", reason: "must be an object" });
      return;
    }
    const r = item as Record<string, unknown>;
    let name = typeof r.name === "string" ? r.name.trim() : "";
    let price = typeof r.price === "string" ? r.price.trim() : "";
    let description = typeof r.description === "string" ? r.description.trim() : undefined;
    const duration_minutes = typeof r.duration_minutes === "number" ? r.duration_minutes : undefined;
    const image = typeof r.image === "string" ? r.image.trim() : undefined;
    const client_id = typeof r.client_id === "string" ? r.client_id.trim() || undefined : undefined;
    const category =
      typeof r.category === "string" && r.category.trim().length > 0
        ? r.category.trim()
        : undefined;

    if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);
    if (price.length > MAX_PRICE) price = price.slice(0, MAX_PRICE);
    if (description !== undefined && description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION);
    }

    if (!name) errors.push({ index, field: "name", reason: "required" });
    if (!price) errors.push({ index, field: "price", reason: "required" });
    if (duration_minutes !== undefined) {
      if (!Number.isInteger(duration_minutes) || duration_minutes < 30 || duration_minutes > 480 || duration_minutes % 30 !== 0) {
        errors.push({ index, field: "duration_minutes", reason: "must be an integer multiple of 30 in [30, 480]" });
      }
    }
    if (image !== undefined && image !== "" && !imageOriginAllowed(image)) {
      errors.push({ index, field: "image", reason: "must be a service-images bucket URL" });
    }
    if (category !== undefined && !categorySet.has(category)) {
      errors.push({ index, field: "category", reason: `not in categories list: "${category}"` });
    }

    // Validate add-ons. Wrap errors with the service index for the row-level UI.
    const aoResult = validateAddOns(r.add_ons);
    if (!aoResult.ok) {
      aoResult.errors.forEach((e) => errors.push({ index, field: e.field, reason: e.reason }));
    }
    const add_ons: AddOn[] | undefined =
      aoResult.ok && aoResult.value.length > 0 ? aoResult.value : undefined;

    services.push({
      name,
      price,
      description: description || undefined,
      duration_minutes,
      image: image || undefined,
      client_id,
      category,
      add_ons,
    });
  });

  return errors.length === 0
    ? { ok: true, services, categories }
    : { ok: false, errors };
}

async function loadStateForTenant(
  tenantId: string,
): Promise<{ services: ServiceItem[]; categories: string[] }> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return { services: [], categories: [] };
  const primary = await supabase
    .from("previews")
    .select("services, categories")
    .eq("slug", slug)
    .maybeSingle();
  if (!primary.error) {
    return {
      services: ((primary.data?.services as ServiceItem[] | null) ?? []),
      categories: ((primary.data?.categories as string[] | null) ?? []),
    };
  }
  // Fallback: categories column may not exist yet in this environment.
  // Re-query services alone so the API still serves correct data.
  const fallback = await supabase
    .from("previews")
    .select("services")
    .eq("slug", slug)
    .maybeSingle();
  return {
    services: ((fallback.data?.services as ServiceItem[] | null) ?? []),
    categories: [],
  };
}

async function saveStateForTenant(
  tenantId: string,
  services: ServiceItem[],
  categories: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return { ok: false, error: "Tenant has no preview_slug" };
  const { error } = await supabase
    .from("previews")
    .update({ services, categories })
    .eq("slug", slug);
  if (error) {
    console.error("[admin/services] save failed", { tenantId, error });
    return { ok: false, error: "Save failed" };
  }
  return { ok: true };
}

export async function GET(request: NextRequest) {
  const tenantIdParam = new URL(request.url).searchParams.get("tenant_id") ?? undefined;
  const auth = await requireOwnerOrFounder(request, tenantIdParam);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const state = await loadStateForTenant(auth.tenantId);
  return NextResponse.json(state);
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const fallbackTenantId =
    typeof (body as Record<string, unknown>)?.tenant_id === "string"
      ? ((body as Record<string, unknown>).tenant_id as string)
      : undefined;

  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = validatePayload(body as Record<string, unknown>);
  if (!result.ok) {
    return NextResponse.json({ error: "Validation failed", errors: result.errors }, { status: 400 });
  }

  const saveResult = await saveStateForTenant(auth.tenantId, result.services, result.categories);
  if (!saveResult.ok) {
    return NextResponse.json({ error: saveResult.error ?? "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, services: result.services, categories: result.categories });
}

import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem, AddOn } from "@/lib/ai/types";
import { validateCategories } from "@/lib/validation/categories";
import { validateAddOns } from "@/lib/validation/add-ons";
import { validateDepositSettings } from "@/lib/validation/deposit-settings";

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
      if (!Number.isInteger(duration_minutes) || duration_minutes < 5 || duration_minutes > 600 || duration_minutes % 5 !== 0) {
        errors.push({ index, field: "duration_minutes", reason: "must be a multiple of 5 in [5, 600] minutes" });
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
): Promise<{
  services: ServiceItem[];
  categories: string[];
  booking_policies: string;
  deposit: {
    deposit_required: boolean;
    deposit_mode: "fixed" | "percent" | null;
    deposit_value: number | null;
    deposit_cashapp: string | null;
    deposit_zelle: string | null;
    deposit_other_label: string | null;
    deposit_other_value: string | null;
  };
}> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  const empty = {
    services: [] as ServiceItem[],
    categories: [] as string[],
    booking_policies: "",
    deposit: {
      deposit_required: false,
      deposit_mode: null as "fixed" | "percent" | null,
      deposit_value: null as number | null,
      deposit_cashapp: null as string | null,
      deposit_zelle: null as string | null,
      deposit_other_label: null as string | null,
      deposit_other_value: null as string | null,
    },
  };
  if (!slug) return empty;

  // Existing services + categories + policies load (with fallback for
  // missing categories column from earlier deploys).
  const primary = await supabase
    .from("previews")
    .select("services, categories, booking_policies")
    .eq("slug", slug)
    .maybeSingle();
  let services: ServiceItem[] = [];
  let categories: string[] = [];
  let booking_policies = "";
  if (!primary.error) {
    services = (primary.data?.services as ServiceItem[] | null) ?? [];
    categories = (primary.data?.categories as string[] | null) ?? [];
    booking_policies = (primary.data?.booking_policies as string | null) ?? "";
  } else {
    const fallback = await supabase
      .from("previews")
      .select("services")
      .eq("slug", slug)
      .maybeSingle();
    services = (fallback.data?.services as ServiceItem[] | null) ?? [];
  }

  // Deposit settings live on booking_settings, keyed by tenant_id.
  const settings = await supabase
    .from("booking_settings")
    .select("deposit_required, deposit_mode, deposit_value, deposit_cashapp, deposit_zelle, deposit_other_label, deposit_other_value")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const deposit = settings.error || !settings.data
    ? empty.deposit
    : {
        deposit_required: !!settings.data.deposit_required,
        deposit_mode: (settings.data.deposit_mode as "fixed" | "percent" | null) ?? null,
        deposit_value: settings.data.deposit_value as number | null,
        deposit_cashapp: (settings.data.deposit_cashapp as string | null) ?? null,
        deposit_zelle: (settings.data.deposit_zelle as string | null) ?? null,
        deposit_other_label: (settings.data.deposit_other_label as string | null) ?? null,
        deposit_other_value: (settings.data.deposit_other_value as string | null) ?? null,
      };

  return { services, categories, booking_policies, deposit };
}

async function saveStateForTenant(
  tenantId: string,
  services: ServiceItem[],
  categories: string[],
  bookingPolicies: string,
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
    .update({ services, categories, booking_policies: bookingPolicies || null })
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

  // Booking policies — free-form text, trimmed and length-capped (10k is
  // generous; the salon example is ~600 chars).
  const rawPolicies = (body as Record<string, unknown>)?.booking_policies;
  const bookingPolicies = typeof rawPolicies === "string" ? rawPolicies.trim().slice(0, 10000) : "";

  // Deposit settings live on booking_settings, not previews — validate
  // and save them through a separate update.
  const b = body as Record<string, unknown>;
  const depositResult = validateDepositSettings({
    deposit_required: b?.deposit_required as boolean | undefined,
    deposit_mode: b?.deposit_mode as "fixed" | "percent" | null | undefined,
    deposit_value: b?.deposit_value as number | null | undefined,
    deposit_cashapp: b?.deposit_cashapp as string | null | undefined,
    deposit_zelle: b?.deposit_zelle as string | null | undefined,
    deposit_other_label: b?.deposit_other_label as string | null | undefined,
    deposit_other_value: b?.deposit_other_value as string | null | undefined,
  });
  if (!depositResult.ok) {
    return NextResponse.json(
      {
        error: "Validation failed",
        errors: depositResult.errors.map((e) => ({ index: -1, field: e.field, reason: e.reason })),
      },
      { status: 400 },
    );
  }

  const saveResult = await saveStateForTenant(auth.tenantId, result.services, result.categories, bookingPolicies);
  if (!saveResult.ok) {
    return NextResponse.json({ error: saveResult.error ?? "Save failed" }, { status: 500 });
  }

  const depositSaveSupabase = createAdminClient();
  const { error: depositSaveError } = await depositSaveSupabase
    .from("booking_settings")
    .update({
      deposit_required: depositResult.value.deposit_required,
      deposit_mode: depositResult.value.deposit_mode,
      deposit_value: depositResult.value.deposit_value,
      deposit_cashapp: depositResult.value.deposit_cashapp,
      deposit_zelle: depositResult.value.deposit_zelle,
      deposit_other_label: depositResult.value.deposit_other_label,
      deposit_other_value: depositResult.value.deposit_other_value,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", auth.tenantId);

  if (depositSaveError) {
    console.error("[admin/services] deposit save failed", { tenantId: auth.tenantId, error: depositSaveError });
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    services: result.services,
    categories: result.categories,
    booking_policies: bookingPolicies,
    deposit: depositResult.value,
  });
}

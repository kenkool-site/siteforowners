import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceItem } from "@/lib/ai/types";

const MAX_NAME = 80;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 1000;

// Public origin of the project's Supabase Storage. Reject image URLs that
// don't originate from here (prevents owners planting arbitrary URLs).
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

function validateServices(raw: unknown): { ok: true; services: ServiceItem[] } | { ok: false; errors: ValidationError[] } {
  if (!Array.isArray(raw)) return { ok: false, errors: [{ index: -1, field: "services", reason: "must be an array" }] };
  const errors: ValidationError[] = [];
  const services: ServiceItem[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push({ index, field: "service", reason: "must be an object" });
      return;
    }
    const r = item as Record<string, unknown>;
    // Length-bounded fields: silently TRUNCATE to the cap rather than
    // rejecting. The maxLength inputs in ServiceRow already prevent over-typing
    // for new edits; truncation handles legacy/AI-generated data that
    // pre-dates the current caps. Save never fails for length reasons.
    let name = typeof r.name === "string" ? r.name.trim() : "";
    let price = typeof r.price === "string" ? r.price.trim() : "";
    let description = typeof r.description === "string" ? r.description.trim() : undefined;
    const duration_minutes = typeof r.duration_minutes === "number" ? r.duration_minutes : undefined;
    const image = typeof r.image === "string" ? r.image.trim() : undefined;

    if (name.length > MAX_NAME) name = name.slice(0, MAX_NAME);
    if (price.length > MAX_PRICE) price = price.slice(0, MAX_PRICE);
    if (description !== undefined && description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION);
    }

    // Required fields and structural rules still error — these can't be
    // fixed by truncation and reflect genuinely invalid input.
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
    services.push({
      name,
      price,
      description: description || undefined,
      duration_minutes,
      image: image || undefined,
    });
  });
  return errors.length === 0 ? { ok: true, services } : { ok: false, errors };
}

async function loadServicesForTenant(tenantId: string): Promise<ServiceItem[]> {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("preview_slug")
    .eq("id", tenantId)
    .maybeSingle();
  const slug = tenant?.preview_slug as string | undefined;
  if (!slug) return [];
  const { data: preview } = await supabase
    .from("previews")
    .select("services")
    .eq("slug", slug)
    .maybeSingle();
  return ((preview?.services as ServiceItem[] | null) ?? []);
}

async function saveServicesForTenant(tenantId: string, services: ServiceItem[]): Promise<{ ok: boolean; error?: string }> {
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
    .update({ services })
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
  const services = await loadServicesForTenant(auth.tenantId);
  return NextResponse.json({ services });
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

  const result = validateServices((body as Record<string, unknown>).services);
  if (!result.ok) {
    return NextResponse.json({ error: "Validation failed", errors: result.errors }, { status: 400 });
  }

  const saveResult = await saveServicesForTenant(auth.tenantId, result.services);
  if (!saveResult.ok) {
    return NextResponse.json({ error: saveResult.error ?? "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, services: result.services });
}

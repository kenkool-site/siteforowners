import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendOrderShopNotification,
  sendOrderCustomerConfirmation,
} from "@/lib/email";

const MAX_ITEMS = 50;
const MAX_QTY = 99;
const MAX_ITEM_NAME = 200;
const MAX_CUSTOMER_NAME = 100;
const MAX_NOTES = 500;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 20;
const RATE_LIMIT_COUNT = 3;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IncomingItem {
  name?: unknown;
  price?: unknown;
  qty?: unknown;
}

interface Body {
  tenant_id?: unknown;
  items?: unknown;
  customer_name?: unknown;
  customer_phone?: unknown;
  customer_email?: unknown;
  customer_notes?: unknown;
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parsePriceCents(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = trimStr(body.tenant_id);
  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
  }

  // Items validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Max ${MAX_ITEMS} items` }, { status: 400 });
  }
  const items: Array<{ name: string; price: string; qty: number }> = [];
  let subtotalCents = 0;
  for (const raw of body.items as IncomingItem[]) {
    const name = trimStr(raw.name);
    const price = trimStr(raw.price);
    const qty = typeof raw.qty === "number" ? raw.qty : NaN;
    if (!name || name.length > MAX_ITEM_NAME) {
      return NextResponse.json({ error: "Invalid item name" }, { status: 400 });
    }
    if (!price) {
      return NextResponse.json({ error: "Invalid item price" }, { status: 400 });
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return NextResponse.json({ error: "Invalid item qty" }, { status: 400 });
    }
    const cents = parsePriceCents(price);
    if (!Number.isFinite(cents) || cents < 0) {
      return NextResponse.json({ error: "Invalid item price" }, { status: 400 });
    }
    items.push({ name, price, qty });
    subtotalCents += cents * qty;
  }

  // Customer fields
  const customerName = trimStr(body.customer_name);
  if (!customerName || customerName.length > MAX_CUSTOMER_NAME) {
    return NextResponse.json({ error: "Invalid customer_name" }, { status: 400 });
  }
  const phoneRaw = trimStr(body.customer_phone);
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneDigits.length < PHONE_MIN_DIGITS || phoneDigits.length > PHONE_MAX_DIGITS) {
    return NextResponse.json({ error: "Invalid customer_phone" }, { status: 400 });
  }
  const customerEmailRaw = trimStr(body.customer_email);
  const customerEmail = customerEmailRaw || null;
  if (customerEmail && !EMAIL_RE.test(customerEmail)) {
    return NextResponse.json({ error: "Invalid customer_email" }, { status: 400 });
  }
  const notesRaw = trimStr(body.customer_notes);
  if (notesRaw.length > MAX_NOTES) {
    return NextResponse.json({ error: "Notes too long" }, { status: 400 });
  }
  const customerNotes = notesRaw || null;

  const supabase = createAdminClient();

  // Load tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, business_name, email, phone, address, checkout_mode, subscription_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (tenantError || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (tenant.checkout_mode !== "pickup") {
    return NextResponse.json(
      { error: "Orders are not enabled for this site" },
      { status: 400 }
    );
  }
  if (!["active", "trialing"].includes(tenant.subscription_status)) {
    return NextResponse.json(
      { error: "Orders are not enabled for this site" },
      { status: 400 }
    );
  }
  if (!tenant.email) {
    return NextResponse.json(
      { error: "Shop notification email not configured" },
      { status: 500 }
    );
  }

  // Rate limit: same tenant + phone ≥ 3 orders in the last 5 minutes.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("orders")
    .select("id", { head: true, count: "exact" })
    .eq("tenant_id", tenantId)
    .eq("customer_phone", phoneDigits)
    .gte("created_at", since);
  if ((recentCount ?? 0) >= RATE_LIMIT_COUNT) {
    return NextResponse.json(
      { error: "Too many orders. Try again in a few minutes." },
      { status: 429 }
    );
  }

  // Insert order
  const { data: inserted, error: insertError } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      items,
      subtotal_cents: subtotalCents,
      customer_name: customerName,
      customer_phone: phoneDigits,
      customer_email: customerEmail,
      customer_notes: customerNotes,
      status: "new",
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    console.error("Order insert failed:", insertError);
    return NextResponse.json({ error: "Failed to save order" }, { status: 500 });
  }

  // Fire both emails in parallel; don't fail the request on email errors.
  const emailPayload = {
    businessName: tenant.business_name as string,
    businessPhone: (tenant.phone as string | null) || undefined,
    businessAddress: (tenant.address as string | null) || undefined,
    items,
    subtotalCents,
    customerName,
    customerPhone: phoneDigits,
    customerEmail: customerEmail || undefined,
    customerNotes: customerNotes || undefined,
  };
  const results = await Promise.allSettled([
    sendOrderShopNotification(tenant.email as string, emailPayload),
    sendOrderCustomerConfirmation(tenant.email as string, emailPayload),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("Order email send failed:", r.reason);
    }
  }

  return NextResponse.json({ order_id: inserted.id, status: "ok" });
}

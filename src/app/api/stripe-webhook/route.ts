import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendFounderNotification } from "@/lib/email";
import type Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export async function POST(request: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const meta = session.metadata || {};
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      console.log(`Checkout completed: ${meta.business_name} (${meta.lead_id})`);

      // Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          business_name: meta.business_name || "Unknown",
          owner_name: meta.owner_name || "Unknown",
          preview_slug: meta.preview_slug,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: "active",
        })
        .select("id")
        .single();

      if (tenantError) {
        console.error("Tenant creation failed:", tenantError);
        break;
      }

      // Mark lead as converted
      if (meta.lead_id) {
        await supabase
          .from("interested_leads")
          .update({
            converted: true,
            tenant_id: tenant.id,
            converted_at: new Date().toISOString(),
          })
          .eq("id", meta.lead_id);
      }

      // Mark preview as converted
      if (meta.preview_slug) {
        await supabase
          .from("previews")
          .update({ converted: true })
          .eq("slug", meta.preview_slug);
      }

      // Notify founder
      await sendFounderNotification({
        ownerName: meta.owner_name || "New Client",
        phone: "",
        businessName: meta.business_name || "Unknown",
        previewSlug: meta.preview_slug || "",
      }).catch((e) => console.error("Notification failed:", e));

      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const status = sub.status; // active, past_due, canceled, etc.

      await supabase
        .from("tenants")
        .update({
          subscription_status: status,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      console.log(`Subscription ${sub.id} updated to: ${status}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;

      await supabase
        .from("tenants")
        .update({
          subscription_status: "canceled",
          site_published: false,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", sub.id);

      console.log(`Subscription ${sub.id} canceled`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

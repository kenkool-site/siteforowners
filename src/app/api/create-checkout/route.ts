import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";
const MONTHLY_PRICE = 5000; // $50.00 in cents

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  try {
    const { lead_id, preview_slug, business_name, owner_name, email, phone } =
      await request.json();

    if (!lead_id || !preview_slug || !business_name || !owner_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create or find Stripe customer
    const customerParams: Record<string, string> = {
      name: owner_name,
      metadata_lead_id: lead_id,
      metadata_preview_slug: preview_slug,
      metadata_business_name: business_name,
    };
    if (email) customerParams.email = email;
    if (phone) customerParams.phone = phone;

    const customer = await stripe.customers.create({
      name: owner_name,
      email: email || undefined,
      phone: phone || undefined,
      metadata: {
        lead_id,
        preview_slug,
        business_name,
      },
    });

    // Create checkout session with embedded subscription
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Website for ${business_name}`,
              description:
                "Professional website with hosting, domain, updates, and support",
            },
            unit_amount: MONTHLY_PRICE,
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          lead_id,
          preview_slug,
          business_name,
          owner_name,
        },
      },
      success_url: `${APP_URL}/onboard/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/preview/${preview_slug}`,
      metadata: {
        lead_id,
        preview_slug,
        business_name,
      },
    });

    // Store the checkout session reference
    const supabase = createAdminClient();
    await supabase
      .from("interested_leads")
      .update({ converted: false }) // will be set to true by webhook
      .eq("id", lead_id);

    return NextResponse.json({
      checkout_url: session.url,
      session_id: session.id,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}

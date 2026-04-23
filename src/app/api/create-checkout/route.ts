import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";
const MONTHLY_PRICE = 5000; // $50.00 in cents

// URL-safe short code. 8 chars from an alphabet that avoids
// easily-confused glyphs (0/O, 1/l/I).
const SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function generateShortCode(len = 8): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return out;
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  try {
    const {
      lead_id,
      preview_slug,
      business_name,
      owner_name,
      email,
      phone,
      promo_code,
    } = await request.json();

    if (!lead_id || !preview_slug || !business_name || !owner_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // If a promo code was selected, look up the Stripe promotion_code ID
    // so we can pre-attach it to the session (no typing required at checkout).
    let promotionCodeId: string | null = null;
    if (promo_code) {
      const codes = await stripe.promotionCodes.list({
        code: promo_code,
        active: true,
        limit: 1,
      });
      if (codes.data.length === 0) {
        return NextResponse.json(
          { error: `Promo code "${promo_code}" not found or inactive` },
          { status: 400 }
        );
      }
      promotionCodeId = codes.data[0].id;
    }

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

    // `discounts` and `allow_promotion_codes` are mutually exclusive —
    // if we auto-apply a code, don't also show the code input.
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      ...(promotionCodeId
        ? { discounts: [{ promotion_code: promotionCodeId }] }
        : { allow_promotion_codes: true }),
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
        ...(promo_code ? { promo_code } : {}),
      },
    });

    const supabase = createAdminClient();

    // Generate a unique short code; in the rare case of collision, retry once.
    let shortCode = generateShortCode();
    let updateErr = await supabase
      .from("interested_leads")
      .update({
        converted: false,
        checkout_short_code: shortCode,
        checkout_url: session.url,
      })
      .eq("id", lead_id);

    if (updateErr.error?.code === "23505") {
      shortCode = generateShortCode();
      updateErr = await supabase
        .from("interested_leads")
        .update({
          converted: false,
          checkout_short_code: shortCode,
          checkout_url: session.url,
        })
        .eq("id", lead_id);
    }

    if (updateErr.error) {
      console.error("Failed to persist short code:", updateErr.error);
      // Fall through — the full Stripe URL still works; short URL won't.
    }

    const shortUrl = `${APP_URL}/go/${shortCode}`;

    return NextResponse.json({
      checkout_url: session.url,
      short_url: updateErr.error ? null : shortUrl,
      session_id: session.id,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    const message = error instanceof Error ? error.message : "Failed to create checkout session";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

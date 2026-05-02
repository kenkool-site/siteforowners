import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/api-rate-limit";

const BUSINESS_TYPES = ["Braids", "Locs", "Haircuts", "Nails", "Salon"] as const;
const LEAD_WINDOW_SECONDS = 60 * 60;
const LEAD_MAX_REQUESTS = 5;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isBusinessType(value: string): value is (typeof BUSINESS_TYPES)[number] {
  return BUSINESS_TYPES.includes(value as (typeof BUSINESS_TYPES)[number]);
}

export async function POST(request: NextRequest) {
  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(
    `marketing-leads:${ipHash}`,
    LEAD_WINDOW_SECONDS,
    LEAD_MAX_REQUESTS,
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const businessName = cleanString(data.businessName);
  const email = cleanString(data.email);
  const phone = cleanString(data.phone);
  const businessAddress = cleanString(data.businessAddress);
  const businessType = cleanString(data.businessType);

  if (!businessName || !email || !phone || !isBusinessType(businessType)) {
    return NextResponse.json(
      { error: "Business name, email, phone, and business type are required." },
      { status: 400 },
    );
  }

  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping marketing lead email — RESEND_API_KEY or ADMIN_EMAIL not set", {
      businessName,
      email,
      phone,
      businessAddress,
      businessType,
    });
    return NextResponse.json({ ok: true });
  }

  const safeBusinessName = escapeHtml(businessName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);
  const safeAddress = businessAddress ? escapeHtml(businessAddress) : "";
  const safeBusinessType = escapeHtml(businessType);

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    replyTo: email,
    subject: `New site request: ${businessName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto;">
        <div style="background: #db2777; padding: 20px 24px; border-radius: 16px 16px 0 0;">
          <p style="margin: 0 0 4px; color: rgba(255,255,255,0.78); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;">SiteForOwners lead</p>
          <h1 style="margin: 0; color: #fff8ee; font-size: 22px;">${safeBusinessName}</h1>
        </div>
        <div style="background: #fff; border: 1px solid #f3d6e4; border-top: 0; padding: 24px; border-radius: 0 0 16px 16px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Business type</td>
              <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeBusinessType}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
              <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #db2777;">${safeEmail}</a></td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
              <td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #db2777;">${safePhone}</a></td>
            </tr>
            ${safeAddress ? `
              <tr>
                <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Address</td>
                <td style="padding: 8px 0; color: #111827;">${safeAddress}</td>
              </tr>
            ` : ""}
          </table>
          <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">Reply to this email to contact the lead directly.</p>
        </div>
      </div>
    `,
  });

  return NextResponse.json({ ok: true });
}

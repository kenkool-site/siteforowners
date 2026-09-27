import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/api-rate-limit";
import { parseInvitespotLead } from "@/lib/invitespot-lead";
import { createAdminClient } from "@/lib/supabase/admin";

const LEAD_WINDOW_SECONDS = 60 * 60;
const LEAD_MAX_REQUESTS = 5;

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  const ipHash = hashIp(getClientIp(request.headers));
  const allowed = await checkRateLimit(`invitespot-leads:${ipHash}`, LEAD_WINDOW_SECONDS, LEAD_MAX_REQUESTS);
  if (!allowed) {
    return NextResponse.json({ error: "Too many submissions. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = parseInvitespotLead(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { name, email, phone, eventType, roughDate, guestCount, referralSlug } = parsed.value;

  // 1) Persist the lead first so it is captured even if email is unconfigured
  //    or Resend fails. Service-role insert bypasses RLS (matches marketing_leads).
  const supabase = createAdminClient();
  const { error: insertError } = await supabase.from("invitespot_leads").insert({
    name,
    email: email || null,
    phone: phone || null,
    event_type: eventType,
    rough_date: roughDate || null,
    guest_count: guestCount,
    referral_slug: referralSlug || null,
  });
  if (insertError) {
    // Don't lose the lead to the user — log and continue to email.
    console.error("invitespot_leads insert failed", insertError);
  }

  // 2) Email the founder, best-effort. Never fail the request on email errors.
  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping invitespot lead email — RESEND_API_KEY or ADMIN_EMAIL not set", { name, email, phone, eventType });
    return NextResponse.json({ ok: true });
  }

  const safeName = escapeHtml(name);
  const safeEmail = email ? escapeHtml(email) : "";
  const safePhone = phone ? escapeHtml(phone) : "";
  const safeEventType = escapeHtml(eventType);
  const safeRoughDate = roughDate ? escapeHtml(roughDate) : "";
  const safeReferral = referralSlug ? escapeHtml(referralSlug) : "";

  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      replyTo: email || undefined,
      subject: `New InviteSpot lead: ${name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto;">
          <div style="background: #1F3A2E; padding: 20px 24px; border-radius: 16px 16px 0 0;">
            <p style="margin: 0 0 4px; color: rgba(244,238,228,0.78); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;">InviteSpot lead</p>
            <h1 style="margin: 0; color: #F4EEE4; font-size: 22px;">${safeName}</h1>
          </div>
          <div style="background: #fff; border: 1px solid #d8cedc; border-top: 0; padding: 24px; border-radius: 0 0 16px 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; width: 132px; color: #6b7280; font-size: 14px;">Planning</td>
                <td style="padding: 8px 0; color: #111827; font-weight: 700;">${safeEventType}</td>
              </tr>
              ${safeEmail ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Email</td>
                  <td style="padding: 8px 0;"><a href="mailto:${safeEmail}" style="color: #1F3A2E;">${safeEmail}</a></td>
                </tr>
              ` : ""}
              ${safePhone ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Phone</td>
                  <td style="padding: 8px 0;"><a href="tel:${safePhone}" style="color: #1F3A2E;">${safePhone}</a></td>
                </tr>
              ` : ""}
              ${safeRoughDate ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Roughly when</td>
                  <td style="padding: 8px 0; color: #111827;">${safeRoughDate}</td>
                </tr>
              ` : ""}
              ${guestCount ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Guests</td>
                  <td style="padding: 8px 0; color: #111827;">${guestCount}</td>
                </tr>
              ` : ""}
              ${safeReferral ? `
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Referred by</td>
                  <td style="padding: 8px 0; color: #111827;">${safeReferral}</td>
                </tr>
              ` : ""}
            </table>
            <p style="margin: 20px 0 0; color: #6b7280; font-size: 13px;">View it in the admin InviteSpot Leads tab.</p>
          </div>
        </div>
      `,
    });
  } catch (emailError) {
    console.error("invitespot lead email failed", emailError);
  }

  return NextResponse.json({ ok: true });
}

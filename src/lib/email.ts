import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = process.env.EMAIL_FROM || "SiteForOwners <hello@siteforowners.com>";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://siteforowners.com";

interface LeadData {
  ownerName: string;
  phone: string;
  email?: string;
  message?: string;
  businessName: string;
  previewSlug: string;
}

/**
 * Notify the founder when a new lead comes in.
 */
export async function sendFounderNotification(lead: LeadData) {
  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping founder notification — RESEND_API_KEY or ADMIN_EMAIL not set");
    return;
  }

  const previewUrl = `${APP_URL}/preview/${lead.previewSlug}`;

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New Lead: ${lead.businessName} — ${lead.ownerName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #F59E0B; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">New Lead from SiteForOwners</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 100px;">Business</td>
              <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${lead.businessName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Name</td>
              <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${lead.ownerName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Phone</td>
              <td style="padding: 8px 0; font-size: 14px;">
                <a href="tel:${lead.phone}" style="color: #2563EB; text-decoration: none;">${lead.phone}</a>
              </td>
            </tr>
            ${lead.email ? `<tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Email</td>
              <td style="padding: 8px 0; font-size: 14px;">
                <a href="mailto:${lead.email}" style="color: #2563EB; text-decoration: none;">${lead.email}</a>
              </td>
            </tr>` : ""}
            ${lead.message ? `<tr>
              <td style="padding: 8px 0; color: #6B7280; font-size: 14px; vertical-align: top;">Message</td>
              <td style="padding: 8px 0; font-size: 14px;">${lead.message}</td>
            </tr>` : ""}
          </table>
          <div style="margin-top: 20px;">
            <a href="${previewUrl}" style="display: inline-block; background: #F59E0B; color: #fff; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
              View Their Preview
            </a>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Send confirmation to the prospect who submitted the lead form.
 */
export async function sendLeadConfirmation(lead: LeadData) {
  if (!resend || !lead.email) {
    console.log("Skipping lead confirmation — no Resend or no email provided");
    return;
  }

  const previewUrl = `${APP_URL}/preview/${lead.previewSlug}`;
  const firstName = lead.ownerName.split(" ")[0];

  await resend.emails.send({
    from: FROM,
    to: lead.email,
    subject: `${firstName}, your website for ${lead.businessName} is almost ready!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #F59E0B, #D97706); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="margin: 0; color: #fff; font-size: 22px;">Site<span style="font-weight: 400;">ForOwners</span></h1>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 32px 24px; border-radius: 0 0 12px 12px;">
          <h2 style="margin: 0 0 12px; font-size: 20px; color: #111;">Hey ${firstName}!</h2>
          <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
            Thanks for your interest in getting a professional website for <strong>${lead.businessName}</strong>. We&apos;re excited to work with you!
          </p>
          <p style="color: #4B5563; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            We&apos;ll reach out within <strong>24 hours</strong> to get everything set up. In the meantime, you can revisit your website preview anytime:
          </p>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${previewUrl}" style="display: inline-block; background: #F59E0B; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
              View Your Preview
            </a>
          </div>
          <div style="background: #F9FAFB; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 13px; color: #6B7280;">
              <strong style="color: #111;">What&apos;s included:</strong><br/>
              Professional website &middot; Custom domain &middot; Hosting &middot; Updates &middot; Support<br/>
              All for <strong>$50/month</strong> &middot; No contracts &middot; Cancel anytime
            </p>
          </div>
          <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
            Questions? Just reply to this email or text us anytime.
          </p>
        </div>
      </div>
    `,
  });
}

interface BookingEmailData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  serviceName: string;
  servicePrice?: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerNotes?: string;
}

/**
 * Notify business owner of a new booking (with .ics attachment)
 */
export async function sendBookingNotification(
  ownerEmail: string,
  booking: BookingEmailData,
  icsContent: string
) {
  if (!resend) return;
  const toEmail = ownerEmail || ADMIN_EMAIL;
  if (!toEmail) return;

  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `New Booking: ${booking.customerName} — ${booking.serviceName} on ${booking.date}`,
    attachments: [
      { filename: "booking.ics", content: Buffer.from(icsContent).toString("base64") },
    ],
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #059669; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">New Booking — ${booking.businessName}</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 90px;">Service</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${booking.serviceName}${booking.servicePrice ? ` (${booking.servicePrice})` : ""}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Date</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${booking.date}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Time</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${booking.time}</td></tr>
            <tr><td colspan="2" style="border-top: 1px solid #eee; padding-top: 8px;"></td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Customer</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${booking.customerName}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Phone</td><td style="padding: 8px 0; font-size: 14px;"><a href="tel:${booking.customerPhone}" style="color: #2563EB;">${booking.customerPhone}</a></td></tr>
            ${booking.customerEmail ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Email</td><td style="padding: 8px 0; font-size: 14px;">${booking.customerEmail}</td></tr>` : ""}
            ${booking.customerNotes ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Notes</td><td style="padding: 8px 0; font-size: 14px;">${booking.customerNotes}</td></tr>` : ""}
          </table>
          <p style="margin-top: 16px; font-size: 13px; color: #9CA3AF;">Calendar invite attached — open to add to your calendar.</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send booking confirmation to the customer (with .ics attachment)
 */
export async function sendBookingConfirmation(booking: BookingEmailData, icsContent: string) {
  if (!resend || !booking.customerEmail) return;
  const firstName = booking.customerName.split(" ")[0];

  await resend.emails.send({
    from: FROM,
    to: booking.customerEmail,
    subject: `Booking Confirmed — ${booking.serviceName} at ${booking.businessName}`,
    attachments: [
      { filename: "booking.ics", content: Buffer.from(icsContent).toString("base64") },
    ],
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #059669; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0; color: #fff; font-size: 20px;">Booking Confirmed!</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #4B5563; font-size: 15px; margin: 0 0 16px;">Hey ${firstName}! Your appointment at <strong>${booking.businessName}</strong> is confirmed.</p>
          <div style="background: #F0FDF4; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>Service:</strong> ${booking.serviceName}${booking.servicePrice ? ` — ${booking.servicePrice}` : ""}</p>
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>Date:</strong> ${booking.date}</p>
            <p style="margin: 0 0 8px; font-size: 14px;"><strong>Time:</strong> ${booking.time}</p>
            ${booking.businessAddress ? `<p style="margin: 0; font-size: 14px;"><strong>Location:</strong> ${booking.businessAddress}</p>` : ""}
          </div>
          <p style="color: #6B7280; font-size: 13px; margin: 0 0 8px;">Calendar invite attached — open to add a reminder.</p>
          ${booking.businessPhone ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Need to reschedule? Call <a href="tel:${booking.businessPhone}" style="color: #2563EB;">${booking.businessPhone}</a></p>` : ""}
        </div>
      </div>
    `,
  });
}

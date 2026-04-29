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

export interface BookingEmailData {
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

/** Spec 5: customer email when a deposit-required booking is placed.
 * Lead with the action and amount so the customer knows what to do next. */
export async function sendBookingPendingDepositEmail(
  booking: BookingEmailData,
  deposit: { amount: number; instructions: string },
) {
  if (!resend) return;
  if (!booking.customerEmail) return;

  const firstName = (booking.customerName.split(" ")[0]) || booking.customerName;
  const subject = `⏳ Pay $${deposit.amount.toFixed(2)} to secure your booking at ${booking.businessName}`;
  await resend.emails.send({
    from: FROM,
    to: booking.customerEmail,
    subject,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #f59e0b; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">Almost there — pay your deposit to lock in this slot</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">Thanks for booking <strong>${escapeHtml(booking.serviceName)}</strong> at <strong>${escapeHtml(booking.businessName)}</strong> on <strong>${escapeHtml(booking.date)} at ${escapeHtml(booking.time)}</strong>.</p>
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-weight: 700; font-size: 18px; color: #78350f; margin-bottom: 8px;">Deposit due: $${deposit.amount.toFixed(2)}</div>
            <div style="white-space: pre-wrap; font-family: ui-monospace, monospace; font-size: 14px; background: #fff; border-radius: 4px; padding: 10px; color: #451a03;">${escapeHtml(deposit.instructions)}</div>
          </div>
          <p style="color: #525252; font-size: 14px; margin: 0 0 6px;">We'll send a confirmation once we receive your deposit. Your slot stays held until then.</p>
          ${booking.businessPhone ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Questions? Call <a href="tel:${escapeHtml(booking.businessPhone)}" style="color: #2563EB;">${escapeHtml(booking.businessPhone)}</a></p>` : ""}
        </div>
      </div>
    `,
  });
}

/** Spec 5: customer email when the owner marks the deposit received. */
export async function sendBookingDepositReceivedEmail(
  booking: BookingEmailData,
  icsContent?: string,
) {
  if (!resend) return;
  if (!booking.customerEmail) return;

  const firstName = (booking.customerName.split(" ")[0]) || booking.customerName;
  const subject = `✓ Deposit received — booking confirmed at ${booking.businessName}`;
  await resend.emails.send({
    from: FROM,
    to: booking.customerEmail,
    subject,
    attachments: icsContent
      ? [{ filename: "booking.ics", content: Buffer.from(icsContent).toString("base64") }]
      : undefined,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #059669; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">Your booking is confirmed!</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">We received your deposit. Your booking is locked in:</p>
          <div style="background: #fafafa; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(booking.serviceName)}</div>
            <div style="font-size: 14px; color: #374151;">${escapeHtml(booking.date)} at ${escapeHtml(booking.time)}</div>
            <div style="font-size: 14px; color: #6B7280; margin-top: 4px;">${escapeHtml(booking.businessName)}${booking.businessAddress ? ` · ${escapeHtml(booking.businessAddress)}` : ""}</div>
          </div>
          ${booking.businessPhone ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Questions? Call <a href="tel:${escapeHtml(booking.businessPhone)}" style="color: #2563EB;">${escapeHtml(booking.businessPhone)}</a></p>` : ""}
        </div>
      </div>
    `,
  });
}

/** Spec 5: customer email when a booking is canceled (paid or not). */
export async function sendBookingCanceledEmail(booking: BookingEmailData) {
  if (!resend) return;
  if (!booking.customerEmail) return;

  const firstName = (booking.customerName.split(" ")[0]) || booking.customerName;
  const subject = `Your booking at ${booking.businessName} has been canceled`;
  await resend.emails.send({
    from: FROM,
    to: booking.customerEmail,
    subject,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 500px; margin: 0 auto;">
        <div style="background: #7f1d1d; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">Booking canceled</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">Hi ${escapeHtml(firstName)},</p>
          <p style="margin: 0 0 12px; font-size: 15px; color: #111827;">Your booking for <strong>${escapeHtml(booking.serviceName)}</strong> on <strong>${escapeHtml(booking.date)} at ${escapeHtml(booking.time)}</strong> at ${escapeHtml(booking.businessName)} has been canceled.</p>
          ${booking.businessPhone ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Questions? Call <a href="tel:${escapeHtml(booking.businessPhone)}" style="color: #2563EB;">${escapeHtml(booking.businessPhone)}</a></p>` : ""}
        </div>
      </div>
    `,
  });
}

interface OrderEmailData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  items: Array<{ name: string; price: string; qty: number }>;
  subtotalCents: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  customerNotes?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function parsePriceCents(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function renderItemsHtml(items: OrderEmailData["items"]): string {
  return items
    .map((item) => {
      const lineCents = parsePriceCents(item.price) * item.qty;
      return `<tr>
        <td style="padding: 4px 0; font-size: 14px;">${escapeHtml(item.name)} × ${item.qty}</td>
        <td style="padding: 4px 0; font-size: 14px; text-align: right;">${formatCents(lineCents)}</td>
      </tr>`;
    })
    .join("");
}

/**
 * Notify the shop owner of a new pickup order.
 */
export async function sendOrderShopNotification(
  shopEmail: string,
  order: OrderEmailData
) {
  if (!resend) {
    console.log("Skipping order shop notification — RESEND_API_KEY not set");
    return;
  }
  if (!shopEmail) {
    console.error("sendOrderShopNotification called without shopEmail");
    return;
  }

  const customerEmailRow = order.customerEmail
    ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Email</td><td style="padding: 8px 0; font-size: 14px;">${escapeHtml(order.customerEmail)}</td></tr>`
    : "";
  const notesRow = order.customerNotes
    ? `<tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; vertical-align: top;">Notes</td><td style="padding: 8px 0; font-size: 14px;">${escapeHtml(order.customerNotes)}</td></tr>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: shopEmail,
    ...(order.customerEmail ? { replyTo: order.customerEmail } : {}),
    subject: `New pickup order — ${order.customerName} — ${formatCents(order.subtotalCents)}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 540px; margin: 0 auto;">
        <div style="background: #059669; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h2 style="margin: 0; color: #fff; font-size: 18px;">New Pickup Order — ${escapeHtml(order.businessName)}</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px; width: 90px;">Customer</td><td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${escapeHtml(order.customerName)}</td></tr>
            <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Phone</td><td style="padding: 8px 0; font-size: 14px;"><a href="tel:${encodeURIComponent(order.customerPhone)}" style="color: #2563EB;">${escapeHtml(order.customerPhone)}</a></td></tr>
            ${customerEmailRow}
            ${notesRow}
          </table>
          <div style="margin-top: 16px; border-top: 1px solid #E5E7EB; padding-top: 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${renderItemsHtml(order.items)}
              <tr><td colspan="2" style="border-top: 1px solid #E5E7EB; padding-top: 8px; margin-top: 4px;"></td></tr>
              <tr>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700;">Subtotal</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right;">${formatCents(order.subtotalCents)}</td>
              </tr>
            </table>
          </div>
          <p style="margin-top: 16px; font-size: 13px; color: #6B7280;">When the order is ready, call or text the customer to let them know.</p>
        </div>
      </div>
    `,
  });
}

/**
 * Send confirmation to the customer who placed a pickup order.
 */
export async function sendOrderCustomerConfirmation(
  shopEmail: string,
  order: OrderEmailData
) {
  if (!resend || !order.customerEmail) return;
  const firstName = order.customerName.split(" ")[0];
  const addressBlock = order.businessAddress
    ? `<p style="margin: 0 0 6px; font-size: 14px;"><strong>Pickup at:</strong><br/>${escapeHtml(order.businessAddress)}</p>`
    : "";
  const phoneBlock = order.businessPhone
    ? `<p style="color: #6B7280; font-size: 13px; margin: 0;">Questions? Call <a href="tel:${encodeURIComponent(order.businessPhone)}" style="color: #2563EB;">${escapeHtml(order.businessPhone)}</a></p>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: order.customerEmail,
    ...(shopEmail ? { replyTo: shopEmail } : {}),
    subject: `Your order at ${order.businessName} — we'll call you when it's ready`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 540px; margin: 0 auto;">
        <div style="background: #059669; padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
          <h2 style="margin: 0; color: #fff; font-size: 20px;">Order Received!</h2>
        </div>
        <div style="background: #fff; border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #4B5563; font-size: 15px; margin: 0 0 12px;">Hi ${escapeHtml(firstName)} — thanks for your order at <strong>${escapeHtml(order.businessName)}</strong>.</p>
          <div style="background: #F0FDF4; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${renderItemsHtml(order.items)}
              <tr><td colspan="2" style="border-top: 1px solid #D1FAE5; padding-top: 6px;"></td></tr>
              <tr>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700;">Subtotal</td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: 700; text-align: right;">${formatCents(order.subtotalCents)}</td>
              </tr>
            </table>
          </div>
          <p style="color: #4B5563; font-size: 14px; margin: 0 0 12px;">We'll call or text you at <strong>${escapeHtml(order.customerPhone)}</strong> when your order is ready for pickup.</p>
          ${addressBlock}
          ${phoneBlock}
        </div>
      </div>
    `,
  });
}

/**
 * Email an owner a PIN reset link (15-minute TTL on the token).
 * The reset URL points back to their own tenant domain — we don't
 * surface SiteForOwners branding to the owner's customers.
 */
export async function sendPinResetEmail(
  toEmail: string,
  resetUrl: string,
  businessName: string
): Promise<void> {
  if (!resend) {
    console.log("Skipping PIN reset email — RESEND_API_KEY not set");
    return;
  }
  const safeBusiness = escapeHtml(businessName);
  // resetUrl is constructed server-side from request.host + a server-generated
  // token; not owner-controlled, but escape attribute context anyway.
  const safeUrl = escapeHtml(resetUrl);
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: `Reset your ${businessName} dashboard PIN`,
    html: `
      <p>Hi,</p>
      <p>Someone (hopefully you) requested a PIN reset for your <b>${safeBusiness}</b> dashboard.</p>
      <p><a href="${safeUrl}" style="display:inline-block;padding:10px 20px;background:#D8006B;color:white;text-decoration:none;border-radius:6px">Set a new PIN</a></p>
      <p>This link expires in 15 minutes. If you didn't request this, you can ignore this email — your PIN won't change.</p>
    `,
  });
}

/**
 * Notify the founder when a new update request is filed.
 * The description and attachment URL are owner-controlled — escape every
 * interpolated field to prevent HTML injection in the founder's inbox.
 */
export async function sendUpdateRequestNotification(req: {
  tenantId: string;
  businessName: string;
  category: string;
  description: string;
  attachmentUrl?: string | null;
}): Promise<void> {
  if (!resend || !ADMIN_EMAIL) {
    console.log("Skipping update-request notification — RESEND_API_KEY or ADMIN_EMAIL not set");
    return;
  }
  const editLink = `${APP_URL}/clients/${req.tenantId}/edit`;
  const safeBusiness = escapeHtml(req.businessName);
  const safeCategory = escapeHtml(req.category);
  // Escape first, then convert newlines to <br/>. The order matters — escaping
  // happens in raw text space before we introduce HTML tags.
  const safeDescription = escapeHtml(req.description).replace(/\n/g, "<br/>");
  const safeUrl = req.attachmentUrl ? escapeHtml(req.attachmentUrl) : null;
  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New update request — ${req.businessName}`,
    html: `
      <p><b>${safeBusiness}</b> filed an update request.</p>
      <p><b>Category:</b> ${safeCategory}</p>
      <p><b>Description:</b><br/>${safeDescription}</p>
      ${safeUrl ? `<p><b>Attachment:</b> <a href="${safeUrl}">${safeUrl}</a></p>` : ""}
      <p><a href="${editLink}">Open client edit page →</a></p>
    `,
  });
}

/**
 * Structured deposit payment methods (CashApp, Zelle, one custom Other).
 * Replaces the free-text deposit_instructions field. Each renderer skips
 * rows the owner left blank — the customer only sees what's actually set.
 */

export interface PaymentMethods {
  cashapp?: string | null;
  zelle?: string | null;
  otherLabel?: string | null;
  otherValue?: string | null;
}

/** Strip the leading $ if the owner typed it. The store/UI persist the
 * bare cashtag and prepend the $ at render time. */
export function normalizeCashapp(handle: string | null | undefined): string {
  if (!handle) return "";
  return handle.trim().replace(/^\$+/, "");
}

export function cashappUrl(handle: string): string {
  return `https://cash.app/$${normalizeCashapp(handle)}`;
}

export function hasAnyMethod(m: PaymentMethods): boolean {
  return Boolean(m.cashapp || m.zelle || (m.otherLabel && m.otherValue));
}

/** Escape `&`, `<`, `>`, `"`, `'` for safe HTML insertion. Local copy so the
 * renderer doesn't reach into email.ts and create a circular-ish dep. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Email-friendly HTML block. Each row is a labeled value; CashApp is a
 * clickable cash.app/$handle link. Returns empty string when nothing is
 * configured so the caller can hide the section. */
export function renderPaymentMethodsHtml(m: PaymentMethods): string {
  const rows: string[] = [];
  if (m.cashapp) {
    const handle = normalizeCashapp(m.cashapp);
    rows.push(
      `<div style="margin: 0 0 8px;"><a href="${esc(cashappUrl(handle))}" style="display: inline-block; padding: 8px 14px; background: #00D632; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">Pay $${esc(handle)} on CashApp →</a></div>`,
    );
  }
  if (m.zelle) {
    rows.push(
      `<div style="margin: 0 0 8px;"><span style="display: inline-block; padding: 8px 14px; background: #6D1ED4; color: #fff; border-radius: 6px; font-size: 14px; font-weight: 600;"><span style="opacity: 0.8; font-size: 12px; margin-right: 6px;">Zelle</span>${esc(m.zelle.trim())}</span></div>`,
    );
  }
  if (m.otherLabel && m.otherValue) {
    rows.push(
      `<div style="margin: 0 0 8px;"><span style="display: inline-block; padding: 8px 14px; background: #374151; color: #fff; border-radius: 6px; font-size: 14px; font-weight: 600;"><span style="opacity: 0.8; font-size: 12px; margin-right: 6px;">${esc(m.otherLabel.trim())}</span>${esc(m.otherValue.trim())}</span></div>`,
    );
  }
  return rows.join("");
}

/** SMS / plain-text variant. */
export function renderPaymentMethodsText(m: PaymentMethods): string {
  const rows: string[] = [];
  if (m.cashapp) {
    const handle = normalizeCashapp(m.cashapp);
    rows.push(`CashApp: ${cashappUrl(handle)}`);
  }
  if (m.zelle) {
    rows.push(`Zelle: ${m.zelle.trim()}`);
  }
  if (m.otherLabel && m.otherValue) {
    rows.push(`${m.otherLabel.trim()}: ${m.otherValue.trim()}`);
  }
  return rows.join("\n");
}

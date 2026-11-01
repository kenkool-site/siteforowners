// Canonical copy for the optional /request-site SMS checkbox.
// The server stores this text; the form renders the same strings with links.

export const REQUEST_SITE_SMS_CONSENT_VERSION = "request-site-preview-sms-v1";

export const REQUEST_SITE_SMS_CONSENT = {
  en: {
    lead: "Yes, text me about my free website preview from SiteForOwners, including my preview link, follow-ups and account updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out at any time. See our ",
    privacyLabel: "Privacy Policy",
    joiner: " and ",
    termsLabel: "Terms",
    end: ".",
  },
  es: {
    lead: "Sí, envíame mensajes de texto sobre la vista previa gratuita de mi sitio web de SiteForOwners, incluido el enlace de mi vista previa, los seguimientos y las actualizaciones de la cuenta. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responde HELP para obtener ayuda o STOP para darte de baja en cualquier momento. Consulta nuestra ",
    privacyLabel: "Política de privacidad",
    joiner: " y los ",
    termsLabel: "Términos",
    end: ".",
  },
} as const;

export type RequestSiteSmsConsentLocale = keyof typeof REQUEST_SITE_SMS_CONSENT;

export function requestSiteSmsConsentPlainText(
  locale: RequestSiteSmsConsentLocale,
): string {
  const copy = REQUEST_SITE_SMS_CONSENT[locale];
  return `${copy.lead}${copy.privacyLabel}${copy.joiner}${copy.termsLabel}${copy.end}`;
}

/** Exact wording shown on the form, English then Spanish. */
export function requestSiteSmsConsentRecordText(): string {
  return `${requestSiteSmsConsentPlainText("en")}\n\n${requestSiteSmsConsentPlainText("es")}`;
}

export const PRIVACY_SMS_PREVIEW_COPY = {
  en: "If you agree to receive text messages from SiteForOwners, we use your phone number only to send messages about your website preview and account. Mobile numbers, SMS opt-in data and consent are not shared with or sold to third parties or affiliates for marketing purposes; they are shared only with the texting service provider we use to deliver messages. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.",
  es: "Si aceptas recibir mensajes de texto de SiteForOwners, usamos tu número de teléfono únicamente para enviarte mensajes sobre la vista previa de tu sitio web y tu cuenta. Los números móviles, los datos de consentimiento de SMS y el consentimiento no se comparten ni se venden a terceros ni a afiliados con fines de marketing; solo se comparten con el proveedor de mensajes de texto que usamos para entregar los mensajes. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responde STOP para darte de baja o HELP para obtener ayuda.",
} as const;

export const PRIVACY_SMS_PREVIEW_OPT_IN = {
  en: "On the free website preview request form, you agree by checking the optional SMS box next to the phone number. That box is unchecked by default. You can submit the form without checking it, and we will not text you about your preview unless you check it.",
  es: "En el formulario de solicitud de vista previa gratuita del sitio web, aceptas al marcar la casilla opcional de SMS junto al número de teléfono. Esa casilla no está marcada de forma predeterminada. Puedes enviar el formulario sin marcarla, y no te enviaremos mensajes de texto sobre tu vista previa a menos que la marques.",
} as const;

export const PRIVACY_SMS_OPT_IN_EXCLUSION =
  "All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.";

export const PRIVACY_SMS_OPT_IN_EXCLUSION_ES =
  "Todas las categorías anteriores excluyen los datos de origen y el consentimiento de los mensajes de texto; esta información no se compartirá con ningún tercero.";

export type StoredSmsConsent = {
  sms_consent: boolean;
  sms_consent_at: string | null;
  sms_consent_text: string | null;
  sms_consent_version: string | null;
  sms_consent_ip: string | null;
  sms_consent_user_agent: string | null;
};

const USER_AGENT_MAX = 500;
const IP_MAX = 128;

export function buildStoredSmsConsent(input: {
  smsConsent: boolean;
  ip: string;
  userAgent: string | null;
  now?: Date;
}): StoredSmsConsent {
  if (!input.smsConsent) {
    return {
      sms_consent: false,
      sms_consent_at: null,
      sms_consent_text: null,
      sms_consent_version: null,
      sms_consent_ip: null,
      sms_consent_user_agent: null,
    };
  }

  const ip = input.ip.trim().slice(0, IP_MAX);
  const userAgent = (input.userAgent ?? "").trim().slice(0, USER_AGENT_MAX);
  return {
    sms_consent: true,
    sms_consent_at: (input.now ?? new Date()).toISOString(),
    sms_consent_text: requestSiteSmsConsentRecordText(),
    sms_consent_version: REQUEST_SITE_SMS_CONSENT_VERSION,
    sms_consent_ip: ip || null,
    sms_consent_user_agent: userAgent || null,
  };
}

/** True when PostgREST/Postgres says the new consent columns are not migrated yet. */
export function isMissingSmsConsentColumn(message: string): boolean {
  return (
    /sms_consent/i.test(message) &&
    /(schema cache|does not exist|could not find)/i.test(message)
  );
}

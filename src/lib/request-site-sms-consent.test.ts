import assert from "node:assert/strict";
import test from "node:test";
import {
  PRIVACY_SMS_OPT_IN_EXCLUSION,
  REQUEST_SITE_SMS_CONSENT_VERSION,
  buildStoredSmsConsent,
  isMissingSmsConsentColumn,
  requestSiteSmsConsentPlainText,
  requestSiteSmsConsentRecordText,
} from "./request-site-sms-consent";

test("request-site consent text names the program, frequency, rates, and opt-out", () => {
  const english = requestSiteSmsConsentPlainText("en");
  assert.equal(
    english,
    "Yes, text me about my free website preview from SiteForOwners, including my preview link, follow-ups and account updates. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out at any time. See our Privacy Policy and Terms.",
  );
  const spanish = requestSiteSmsConsentPlainText("es");
  assert.match(spanish, /SiteForOwners/);
  assert.match(spanish, /HELP/);
  assert.match(spanish, /STOP/);
  assert.match(spanish, /Política de privacidad/);
  assert.match(spanish, /Términos/);
  assert.equal(
    requestSiteSmsConsentRecordText(),
    `${english}\n\n${spanish}`,
  );
});

test("stored SMS consent is empty unless the box was checked", () => {
  const declined = buildStoredSmsConsent({
    smsConsent: false,
    ip: "203.0.113.8",
    userAgent: "TestAgent",
    now: new Date("2026-11-01T12:00:00.000Z"),
  });
  assert.deepEqual(declined, {
    sms_consent: false,
    sms_consent_at: null,
    sms_consent_text: null,
    sms_consent_version: null,
    sms_consent_ip: null,
    sms_consent_user_agent: null,
  });
});

test("stored SMS consent keeps the exact text, version, ip, and user agent", () => {
  const stored = buildStoredSmsConsent({
    smsConsent: true,
    ip: " 203.0.113.8 ",
    userAgent: " Mozilla/5.0 ",
    now: new Date("2026-11-01T12:00:00.000Z"),
  });
  assert.equal(stored.sms_consent, true);
  assert.equal(stored.sms_consent_at, "2026-11-01T12:00:00.000Z");
  assert.equal(stored.sms_consent_text, requestSiteSmsConsentRecordText());
  assert.equal(stored.sms_consent_version, REQUEST_SITE_SMS_CONSENT_VERSION);
  assert.equal(stored.sms_consent_ip, "203.0.113.8");
  assert.equal(stored.sms_consent_user_agent, "Mozilla/5.0");
});

test("privacy policy exclusion sentence is the carrier wording", () => {
  assert.equal(
    PRIVACY_SMS_OPT_IN_EXCLUSION,
    "All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.",
  );
});

test("missing consent columns are detected only from schema errors", () => {
  assert.equal(
    isMissingSmsConsentColumn(
      "Could not find the 'sms_consent' column of 'marketing_leads' in the schema cache",
    ),
    true,
  );
  assert.equal(isMissingSmsConsentColumn("duplicate key value"), false);
});

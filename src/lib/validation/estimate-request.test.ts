import assert from "node:assert/strict";
import test from "node:test";
import { parseEstimateFormFields } from "./estimate-request";

function validForm(): FormData {
  const form = new FormData();
  form.set("name", "Ana Rivera");
  form.set("phone", "(832) 555-0147");
  form.set("service", "Sprinkler Repair");
  form.set("location", "Richmond, TX");
  form.set("description", "One zone does not turn on.");
  form.set("preferred_response", "whatsapp");
  form.set("company_website", "");
  return form;
}

test("parses and normalizes a valid estimate", () => {
  const result = parseEstimateFormFields(validForm(), "en", "/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.customer_phone, "+18325550147");
    assert.equal(result.value.preferred_response, "whatsapp");
    assert.equal(result.value.customer_name, "Ana Rivera");
    assert.equal(result.value.service_needed, "Sprinkler Repair");
    assert.equal(result.value.job_location, "Richmond, TX");
    assert.equal(result.value.locale, "en");
    assert.equal(result.value.source_path, "/");
  }
});

test("rejects honeypot submissions", () => {
  const form = validForm();
  form.set("company_website", "https://spam.invalid");
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.isSpam, true);
    assert.equal(result.errors.length, 0);
  }
});

test("returns field errors for over-limit values", () => {
  const form = validForm();
  form.set("description", "x".repeat(2001));
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.isSpam, false);
    assert.ok(result.errors.some((error) => error.field === "description" && error.reason === "too_long"));
  }
});

test("returns required errors for missing fields", () => {
  const form = new FormData();
  form.set("company_website", "");
  const result = parseEstimateFormFields(form, "es", "/es");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.field === "name" && error.reason === "required"));
    assert.ok(result.errors.some((error) => error.field === "phone" && error.reason === "required"));
  }
});

test("rejects invalid phone numbers", () => {
  const form = validForm();
  form.set("phone", "not-a-phone");
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.field === "phone" && error.reason === "invalid"));
  }
});

test("rejects invalid preferred_response values", () => {
  const form = validForm();
  form.set("preferred_response", "email");
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(
      result.errors.some((error) => error.field === "preferred_response" && error.reason === "invalid"),
    );
  }
});

test("does not coerce non-string form values", () => {
  const form = validForm();
  form.set("name", new Blob(["ignored"]) as unknown as string);
  const result = parseEstimateFormFields(form, "en", "/");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.errors.some((error) => error.field === "name" && error.reason === "required"));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { displayedServiceDescription } from "./service-description";

const generated = "A smooth, shiny transformation that keeps your natural texture healthy and bouncing.";

test("an untouched service still shows generated copy", () => {
  assert.equal(displayedServiceDescription(undefined, generated, true), generated);
  assert.equal(displayedServiceDescription(null, generated, true), generated);
});

test("a saved description is ignored while generated copy exists, except when cleared", () => {
  assert.equal(
    displayedServiceDescription("Owner's own words.", generated, true),
    generated,
  );
});

test("clearing a Maison description hides the generated sentence", () => {
  assert.equal(displayedServiceDescription("", generated, true), undefined);
  assert.equal(displayedServiceDescription("   ", generated, true), undefined);
});

test("other templates still fall back to generated copy when the field is blank", () => {
  assert.equal(displayedServiceDescription("", generated, false), generated);
});

test("without generated copy, the service description is what shows", () => {
  assert.equal(displayedServiceDescription("Owner's own words.", undefined, true), "Owner's own words.");
  assert.equal(displayedServiceDescription("", undefined, true), undefined);
  assert.equal(displayedServiceDescription(undefined, undefined, true), undefined);
});

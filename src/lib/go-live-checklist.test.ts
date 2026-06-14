import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_ITEMS,
  MANUAL_ITEMS,
  deriveAuto,
  computeProgress,
  isManualItemId,
} from "./go-live-checklist";

test("there are 3 auto items and 8 manual items", () => {
  assert.equal(AUTO_ITEMS.length, 3);
  assert.equal(MANUAL_ITEMS.length, 8);
});

test("deriveAuto reflects live, domain, and locality", () => {
  assert.deepEqual(
    deriveAuto({ isDemo: false, customDomain: "x.com", subdomain: null, seoLocality: "Philadelphia, PA" }),
    { live: true, domain: true, locality: true },
  );
  assert.deepEqual(
    deriveAuto({ isDemo: true, customDomain: null, subdomain: null, seoLocality: null }),
    { live: false, domain: false, locality: false },
  );
});

test("deriveAuto: subdomain alone satisfies domain; blank locality is not set", () => {
  const r = deriveAuto({ isDemo: false, customDomain: null, subdomain: "letstrylocs", seoLocality: "  " });
  assert.equal(r.domain, true);
  assert.equal(r.locality, false);
});

test("isManualItemId accepts manual ids and rejects auto/unknown ids", () => {
  assert.equal(isManualItemId("gbp_created"), true);
  assert.equal(isManualItemId("gsc_index"), true);
  assert.equal(isManualItemId("live"), false); // auto item
  assert.equal(isManualItemId("nonsense"), false);
});

test("computeProgress counts auto + manual against a total of 11", () => {
  const auto = { live: true, domain: true, locality: false };
  const manual = { gbp_created: "2026-06-13T00:00:00.000Z", reviews: "2026-06-13T00:00:00.000Z" };
  assert.deepEqual(computeProgress(auto, manual), { done: 4, total: 11 });

  assert.deepEqual(
    computeProgress({ live: false, domain: false, locality: false }, {}),
    { done: 0, total: 11 },
  );
});

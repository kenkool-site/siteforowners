import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SQUARE_HOST_RE,
  scrapeSquareParams,
  mapSquareToBookingCategories,
  type SquareCatalog,
} from "./square-import";

const DIRECT_URL = "https://shop.square.site/s/appointments";

test("SQUARE_HOST_RE matches Square hosts and rejects other platforms", () => {
  assert.ok(SQUARE_HOST_RE.test("https://slayedbyshy-106546.square.site/"));
  assert.ok(SQUARE_HOST_RE.test("https://squareup.com/appointments/book/ABC"));
  assert.ok(SQUARE_HOST_RE.test("https://book.squareup.com/appointments/X/location/Y/services"));
  assert.ok(!SQUARE_HOST_RE.test("https://salon.acuityscheduling.com/"));
  assert.ok(!SQUARE_HOST_RE.test("https://booksy.com/en-us/123_salon"));
  assert.ok(!SQUARE_HOST_RE.test("https://www.vagaro.com/divashairbraiding"));
});

test("scrapeSquareParams pulls the three identifiers from page HTML", () => {
  const html = `
    <div data-seller-key="L0X4205E9K5DZ"></div>
    <script>window.boot = {"user":{"id":155720808,"properties":{}},
      "site_id":401536933602187772,"site_id":"318b0060-61b7-11f1-b066-d3b57c62a268"}</script>
  `;
  assert.deepEqual(scrapeSquareParams(html), {
    sellerKey: "L0X4205E9K5DZ",
    userId: "155720808",
    siteId: "401536933602187772",
  });
});

test("scrapeSquareParams returns null when any identifier is missing", () => {
  const full = `<div data-seller-key="L0X4205E9K5DZ"></div>
    <script>{"user":{"id":155720808},"site_id":401536933602187772}</script>`;
  assert.ok(scrapeSquareParams(full) !== null);

  assert.equal(
    scrapeSquareParams(`<script>{"user":{"id":1},"site_id":2}</script>`),
    null,
    "missing seller key → null",
  );
  assert.equal(
    scrapeSquareParams(`<div data-seller-key="ABC"></div><script>{"site_id":2}</script>`),
    null,
    "missing user id → null",
  );
  assert.equal(
    scrapeSquareParams(`<div data-seller-key="ABC"></div><script>{"user":{"id":1}}</script>`),
    null,
    "missing numeric site id → null",
  );
});

function catalog(partial: Partial<SquareCatalog>): SquareCatalog {
  return { items: [], categories: [], ...partial };
}

test("mapSquareToBookingCategories converts cents→dollars and ms→duration string", () => {
  const result = mapSquareToBookingCategories(
    catalog({
      items: [
        {
          type: "ITEM",
          id: "A",
          item_data: {
            name: "Jumbo Box braid",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "v1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 15000, currency: "USD" },
                  service_duration: 9000000, // 150 min
                  available_for_booking: true,
                },
              },
            ],
          },
        },
      ],
    }),
    DIRECT_URL,
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Services");
  assert.equal(result[0].directUrl, DIRECT_URL);
  assert.deepEqual(result[0].services, [
    { id: 0, name: "Jumbo Box braid", price: "$150", duration: "150 min" },
  ]);
});

test("mapSquareToBookingCategories preserves long durations as exact strings (no cap here)", () => {
  const result = mapSquareToBookingCategories(
    catalog({
      items: [
        {
          type: "ITEM",
          id: "A",
          item_data: {
            name: "Small box braids",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "v1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 30000, currency: "USD" },
                  service_duration: 34200000, // 570 min
                  available_for_booking: true,
                },
              },
            ],
          },
        },
      ],
    }),
    DIRECT_URL,
  );
  assert.equal(result[0].services[0].duration, "570 min");
});

test("mapSquareToBookingCategories appends variation names only for multi-tier items", () => {
  const result = mapSquareToBookingCategories(
    catalog({
      items: [
        {
          type: "ITEM",
          id: "A",
          item_data: {
            name: "Box braids",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "v1",
                item_variation_data: {
                  name: "Small",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 30000, currency: "USD" },
                  service_duration: 1800000,
                  available_for_booking: true,
                },
              },
              {
                type: "ITEM_VARIATION",
                id: "v2",
                item_variation_data: {
                  name: "Large",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 17000, currency: "USD" },
                  service_duration: 1800000,
                  available_for_booking: true,
                },
              },
            ],
          },
        },
      ],
    }),
    DIRECT_URL,
  );
  assert.deepEqual(
    result[0].services.map((s) => s.name),
    ["Box braids – Small", "Box braids – Large"],
  );
});

test("mapSquareToBookingCategories filters deposits, non-bookable, and non-fixed-price rows", () => {
  const result = mapSquareToBookingCategories(
    catalog({
      items: [
        {
          type: "ITEM",
          id: "dep",
          item_data: {
            name: "Deposits",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "d1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 2000, currency: "USD" },
                  service_duration: 900000,
                  available_for_booking: true,
                },
              },
            ],
          },
        },
        {
          type: "ITEM",
          id: "off",
          item_data: {
            name: "Hidden service",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "o1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 5000, currency: "USD" },
                  service_duration: 1800000,
                  available_for_booking: false,
                },
              },
            ],
          },
        },
        {
          type: "ITEM",
          id: "var",
          item_data: {
            name: "Custom quote",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "q1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "VARIABLE_PRICING",
                  available_for_booking: true,
                  service_duration: 1800000,
                },
              },
            ],
          },
        },
        {
          type: "ITEM",
          id: "ok",
          item_data: {
            name: "Waist length",
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "k1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 5000, currency: "USD" },
                  service_duration: 1800000,
                  available_for_booking: true,
                },
              },
            ],
          },
        },
      ],
    }),
    DIRECT_URL,
  );
  assert.deepEqual(
    result.flatMap((c) => c.services.map((s) => s.name)),
    ["Waist length"],
  );
});

test("mapSquareToBookingCategories groups services under their Square category name", () => {
  const result = mapSquareToBookingCategories(
    catalog({
      categories: [{ type: "CATEGORY", id: "cat1", category_data: { name: "Braids" } }],
      items: [
        {
          type: "ITEM",
          id: "A",
          item_data: {
            name: "Box braids",
            categories: [{ id: "cat1" }],
            variations: [
              {
                type: "ITEM_VARIATION",
                id: "v1",
                item_variation_data: {
                  name: "Regular",
                  pricing_type: "FIXED_PRICING",
                  price_money: { amount: 30000, currency: "USD" },
                  service_duration: 1800000,
                  available_for_booking: true,
                },
              },
            ],
          },
        },
      ],
    }),
    DIRECT_URL,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Braids");
});

test("mapSquareToBookingCategories handles the real captured catalog", () => {
  const data = JSON.parse(
    readFileSync(new URL("./__fixtures__/square-services.json", import.meta.url), "utf8"),
  ) as SquareCatalog;
  const result = mapSquareToBookingCategories(data, DIRECT_URL);
  const names = result.flatMap((c) => c.services.map((s) => s.name));

  // 17 items in the feed; the $20 "Deposits" item is dropped.
  assert.ok(!names.some((n) => /deposit/i.test(n)), "deposits filtered out");
  assert.ok(names.includes("Small box braids"), "real service present");

  // The 570-min service survives un-truncated as an exact string.
  const small = result
    .flatMap((c) => c.services)
    .find((s) => s.name === "Small box braids");
  assert.equal(small?.duration, "570 min");
  assert.equal(small?.price, "$300");

  // Every emitted row has a price and a duration string.
  for (const s of result.flatMap((c) => c.services)) {
    assert.match(s.price, /^\$\d/, `price formatted: ${s.name}`);
    assert.match(s.duration, /^\d+ min$/, `duration formatted: ${s.name}`);
  }
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  mapVagaroServicesToBookingCategories,
  parseVagaroRuntimeConfig,
} from "./vagaro-import";

test("parseVagaroRuntimeConfig extracts regional API fields from escaped page state", () => {
  const html = `
    <input type="hidden" id="hdnToken0" value="" />
    <input type="hidden" id="hdnToken2" value="NBtJFJzNIeshKJAEwmKASW" />
    <script>
      window.__state = "{\\"objUserCustomData\\":{\\"groupId\\":\\"US03\\",\\"BusinessID\\":0},\\"BusinessDetail\\":{\\"BusinessID\\":308134,\\"BookText\\":\\"Book\\",\\"ClassBookText\\":\\"Book\\",\\"CurrencySymbol\\":\\"$\\",\\"MerchantAccount\\":1,\\"IsShowCustomPackage\\":false,\\"IsOutcallMandatory\\":false,\\"OutcallPointRedeem\\":0,\\"OutCallPrice\\":0,\\"IsMobileServiceMandatory\\":0}}";
    </script>
  `;

  assert.deepEqual(parseVagaroRuntimeConfig(html), {
    region: "us03",
    businessId: "308134",
    token0: "",
    token2: "NBtJFJzNIeshKJAEwmKASW",
    bookText: "Book",
    classBookText: "Book",
    currencySymbol: "$",
    merchantAccount: 1,
    isShowCustomPackage: false,
    isOutcallMandatory: false,
    outcallPointRedeem: 0,
    outcallPrice: 0,
    isMobileServiceMandatory: 0,
  });
});

test("mapVagaroServicesToBookingCategories preserves categories, prices, descriptions, and service ids", () => {
  const categories = mapVagaroServicesToBookingCategories(
    {
      Services: [
        {
          ServiceCategoryTitle: "KNOTLESS BRAID SPECIAL",
          ServiceList: [
            {
              ServiceID: 27361558,
              ServiceTitle: "Medium Knotless Box Braids",
              PriceText: "Starting at $200.00",
              ServiceDesc: "FREE Wash & Blow Dry Included\nBraiding Hair Included",
              ServiceOrder: 2,
            },
            {
              ServiceID: 27361563,
              ServiceTitle: "Medium Boho Knotless Braids",
              PriceText: "$250.00",
              ServiceDesc: "Knotless Braids With Human Hair Curls",
              ServiceOrder: 3,
            },
          ],
        },
      ],
    },
    "https://www.vagaro.com/divashairbraiding",
  );

  assert.deepEqual(categories, [
    {
      name: "KNOTLESS BRAID SPECIAL",
      directUrl: "https://www.vagaro.com/divashairbraiding/services",
      services: [
        {
          id: 27361558,
          name: "Medium Knotless Box Braids",
          price: "Starting at $200.00",
          duration: "60 min",
          description: "FREE Wash & Blow Dry Included\nBraiding Hair Included",
        },
        {
          id: 27361563,
          name: "Medium Boho Knotless Braids",
          price: "$250.00",
          duration: "60 min",
          description: "Knotless Braids With Human Hair Curls",
        },
      ],
    },
  ]);
});

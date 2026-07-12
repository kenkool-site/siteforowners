import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home-services editor excludes stylist operational controls", async () => {
  const source = await readFile(
    "src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx",
    "utf8",
  );
  assert.doesNotMatch(source, /DepositEditor|BookingHoursEditor|booking provider|Acuity|Booksy/i);
  assert.match(source, /English/);
  assert.match(source, /Español/);
  assert.match(source, /HomeServicesConfig/);
});

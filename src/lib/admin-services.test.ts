import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlankService } from "./admin-services";

test("createBlankService creates an expanded-ready blank service", () => {
  const service = createBlankService("new-service-id");

  assert.deepEqual(service, {
    name: "",
    price: "",
    duration_minutes: 60,
    client_id: "new-service-id",
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { uniqueEventIdsForHost } from "./hosts";

test("host event IDs are stable and deduplicated", () => {
  assert.deepEqual(uniqueEventIdsForHost([
    { event_id: "event-2" },
    { event_id: "event-1" },
    { event_id: "event-2" },
  ]), ["event-2", "event-1"]);
});

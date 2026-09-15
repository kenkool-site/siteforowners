import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const repository = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");

test("invitation owner embeds identify their exact foreign-key relationship", () => {
  assert.doesNotMatch(repository, /invitation_owners!inner/);
  assert.doesNotMatch(notifications, /invitation_owners!inner/);
  assert.match(repository, /invitation_owners!invitation_events_owner_id_fkey!inner/);
  assert.match(repository, /invitation_owners!invitation_event_hosts_owner_id_fkey!inner/);
  assert.match(notifications, /invitation_owners!invitation_event_hosts_owner_id_fkey!inner/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardPage = readFileSync(new URL("../../app/invitations/manage/[eventId]/page.tsx", import.meta.url), "utf8");
const editorPage = readFileSync(new URL("../../app/invitations/manage/[eventId]/edit/page.tsx", import.meta.url), "utf8");

test("owner management lands on the guest dashboard while customization has a dedicated route", () => {
  assert.match(dashboardPage, /OwnerGuestDashboard/);
  assert.doesNotMatch(dashboardPage, /<EventEditor/);
  assert.match(editorPage, /<EventEditor/);
});

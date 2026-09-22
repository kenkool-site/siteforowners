// src/lib/invitations/memories/ai-provider.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { resolveModerationOutcome } from "./ai-provider";

test("high-confidence unsafe content is rejected in either mode", () => {
  const result = resolveModerationOutcome("auto_publish", { highestConfidence: 0.95, categories: ["Explicit Nudity"] });
  assert.equal(result.moderationStatus, "rejected");
});

test("borderline confidence is flagged for host review in either mode", () => {
  const result = resolveModerationOutcome("review_required", { highestConfidence: 0.6, categories: ["Suggestive"] });
  assert.equal(result.moderationStatus, "flagged");
});

test("clean content auto-approves in auto_publish mode", () => {
  const result = resolveModerationOutcome("auto_publish", { highestConfidence: 0, categories: [] });
  assert.equal(result.moderationStatus, "approved");
});

test("clean content waits for the host in review_required mode, distinct from unchecked pending", () => {
  const result = resolveModerationOutcome("review_required", { highestConfidence: 0, categories: [] });
  assert.equal(result.moderationStatus, "awaiting_host_review");
});

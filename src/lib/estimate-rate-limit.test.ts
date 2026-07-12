import assert from "node:assert/strict";
import test from "node:test";
import { ESTIMATE_RATE_LIMIT, estimateRateLimitBucket } from "./estimate-rate-limit";

test("estimateRateLimitBucket composes deterministic key", () => {
  assert.equal(estimateRateLimitBucket("tenant-1", "hash-abc"), "estimate:tenant-1:hash-abc");
});

test("ESTIMATE_RATE_LIMIT matches baseline policy", () => {
  assert.equal(ESTIMATE_RATE_LIMIT.windowSeconds, 3600);
  assert.equal(ESTIMATE_RATE_LIMIT.maxRequests, 5);
});

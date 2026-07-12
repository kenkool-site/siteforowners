import assert from "node:assert/strict";
import test from "node:test";

import { initialEstimateRetryState, reduceEstimateRetryState } from "./estimate-retry-state";

test("concurrent retries remain pending independently when one completes", () => {
  const textKey = "request-1:text";
  const emailKey = "request-1:email";

  const bothPending = reduceEstimateRetryState(
    reduceEstimateRetryState(initialEstimateRetryState, { type: "start", key: textKey }),
    { type: "start", key: emailKey },
  );
  const textCompleted = reduceEstimateRetryState(bothPending, { type: "success", key: textKey });

  assert.equal(textCompleted[textKey]?.pending, false);
  assert.equal(textCompleted[emailKey]?.pending, true);
});

test("retry errors stay local to their request and channel", () => {
  const textKey = "request-1:text";
  const emailKey = "request-1:email";
  const otherRequestKey = "request-2:text";

  let state = reduceEstimateRetryState(initialEstimateRetryState, { type: "start", key: textKey });
  state = reduceEstimateRetryState(state, { type: "start", key: emailKey });
  state = reduceEstimateRetryState(state, {
    type: "failure",
    key: textKey,
    error: "Text provider unavailable",
  });

  assert.deepEqual(state[textKey], { pending: false, error: "Text provider unavailable" });
  assert.deepEqual(state[emailKey], { pending: true, error: null });
  assert.equal(state[otherRequestKey], undefined);
});

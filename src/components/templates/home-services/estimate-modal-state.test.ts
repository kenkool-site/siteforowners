import assert from "node:assert/strict";
import test from "node:test";
import { estimateModalReducer, initialEstimateModalState } from "./estimate-modal-state";

test("opens with a preselected service and resets after completion", () => {
  const opened = estimateModalReducer(initialEstimateModalState, { type: "open", service: "Tree Trimming" });
  assert.deepEqual(opened, { open: true, service: "Tree Trimming", completed: false });
  const completed = estimateModalReducer(opened, { type: "complete" });
  assert.equal(estimateModalReducer(completed, { type: "close" }).service, "");
});

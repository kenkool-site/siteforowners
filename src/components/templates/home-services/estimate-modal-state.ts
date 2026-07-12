export type EstimateDeliveryMode = "preview_mock" | "tenant";
export interface EstimateModalState { open: boolean; service: string; completed: boolean }
export const initialEstimateModalState: EstimateModalState = { open: false, service: "", completed: false };
export type EstimateModalAction = { type: "open"; service?: string } | { type: "complete" } | { type: "close" };
export function estimateModalReducer(state: EstimateModalState, action: EstimateModalAction): EstimateModalState {
  if (action.type === "open") return { open: true, service: action.service ?? "", completed: false };
  if (action.type === "complete") return { ...state, completed: true };
  return initialEstimateModalState;
}

export type EstimateRetryEntry = {
  pending: boolean;
  error: string | null;
};

export type EstimateRetryState = Record<string, EstimateRetryEntry>;

export type EstimateRetryAction =
  | { type: "start"; key: string }
  | { type: "success"; key: string }
  | { type: "failure"; key: string; error: string };

export const initialEstimateRetryState: EstimateRetryState = {};

export function reduceEstimateRetryState(
  state: EstimateRetryState,
  action: EstimateRetryAction,
): EstimateRetryState {
  if (action.type === "start") {
    return { ...state, [action.key]: { pending: true, error: null } };
  }

  if (action.type === "failure") {
    return { ...state, [action.key]: { pending: false, error: action.error } };
  }

  return { ...state, [action.key]: { pending: false, error: null } };
}

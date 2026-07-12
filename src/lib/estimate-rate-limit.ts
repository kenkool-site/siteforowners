export const ESTIMATE_RATE_LIMIT = { windowSeconds: 3600, maxRequests: 5 } as const;

export function estimateRateLimitBucket(tenantId: string, ipHash: string): string {
  return `estimate:${tenantId}:${ipHash}`;
}

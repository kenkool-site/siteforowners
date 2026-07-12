import { estimateDeliveryUpdate, type EstimateChannelResult } from "./estimate-delivery";

type Options = {
  persist: () => Promise<string>;
  deliverText: () => Promise<EstimateChannelResult>;
  deliverEmail: () => Promise<EstimateChannelResult>;
  update: (requestId: string, value: Record<string, string | null>) => Promise<void>;
};

export async function orchestrateEstimateDelivery(options: Options): Promise<{ ok: true }> {
  const requestId = await options.persist();
  const [text, email] = await Promise.all([
    options.deliverText(),
    options.deliverEmail(),
  ]);
  await options.update(requestId, estimateDeliveryUpdate(text, email));
  return { ok: true };
}

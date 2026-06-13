import type { ServiceItem } from "@/lib/ai/types";

export function createBlankService(clientId: string): ServiceItem {
  return {
    name: "",
    price: "",
    duration_minutes: 60,
    client_id: clientId,
  };
}

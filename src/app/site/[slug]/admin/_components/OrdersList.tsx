"use client";

import { useState } from "react";
import { Order, OrderDetailDrawer } from "./OrderDetailDrawer";

const STATUS_PILL: Record<Order["status"], string> = {
  new: "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]",
  ready: "bg-amber-100 text-amber-700",
  picked_up: "bg-green-100 text-green-700",
  canceled: "bg-gray-200 text-gray-600",
};

export function OrdersList({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [openId, setOpenId] = useState<string | null>(null);
  const openOrder = openId ? orders.find((o) => o.id === openId) ?? null : null;

  function patch(next: Order) {
    setOrders((list) => list.map((o) => (o.id === next.id ? next : o)));
  }

  if (orders.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
        No orders here yet.
      </div>
    );
  }

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg">
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setOpenId(o.id)}
            className="w-full px-4 py-3 border-b border-gray-100 last:border-b-0 text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {o.customer_name} · ${(o.subtotal_cents / 100).toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {o.items.length} item{o.items.length === 1 ? "" : "s"}
                </div>
              </div>
              <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + STATUS_PILL[o.status]}>
                {o.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
          </button>
        ))}
      </div>
      {openOrder && (
        <OrderDetailDrawer
          order={openOrder}
          onClose={() => setOpenId(null)}
          onChange={patch}
        />
      )}
    </>
  );
}

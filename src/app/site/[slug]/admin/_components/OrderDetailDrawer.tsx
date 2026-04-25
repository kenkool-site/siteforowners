"use client";

import { useState } from "react";

export type OrderItem = { name?: string; qty?: number; price_cents?: number };

export type Order = {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  customer_notes: string | null;
  items: OrderItem[];
  subtotal_cents: number;
  status: "new" | "ready" | "picked_up" | "canceled";
  created_at: string;
};

const NEXT_LABEL: Record<Order["status"], string> = {
  new: "Mark ready",
  ready: "Mark picked up",
  picked_up: "Picked up ✓",
  canceled: "Canceled",
};
const NEXT_STATUS: Record<Order["status"], Order["status"] | null> = {
  new: "ready",
  ready: "picked_up",
  picked_up: null,
  canceled: null,
};

function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24);
  return d + " day" + (d === 1 ? "" : "s") + " ago";
}

export function OrderDetailDrawer({
  order,
  onClose,
  onChange,
}: {
  order: Order;
  onClose: () => void;
  onChange: (next: Order) => void;
}) {
  const [pending, setPending] = useState(false);

  async function transition(toStatus: Order["status"]) {
    if (pending) return;
    const prev = order;
    const optimistic = { ...order, status: toStatus };
    onChange(optimistic);
    setPending(true);
    try {
      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, toStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || "Could not update order");
        onChange(prev);
      }
    } catch {
      alert("Network error");
      onChange(prev);
    } finally {
      setPending(false);
    }
  }

  const primaryNext = NEXT_STATUS[order.status];
  const canCancel = order.status === "new" || order.status === "ready";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl md:mb-10 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded mx-auto mb-3 md:hidden" />
        <div className="flex justify-between items-start">
          <div>
            <div className="text-base font-semibold">{order.customer_name}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              <a href={"tel:" + order.customer_phone} className="text-[color:var(--admin-primary)] underline">
                {order.customer_phone}
              </a>
              {" · "}
              {formatRelative(order.created_at)}
            </div>
          </div>
          <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " +
            (order.status === "new" ? "bg-[var(--admin-primary-light)] text-[color:var(--admin-primary)]"
              : order.status === "ready" ? "bg-amber-100 text-amber-700"
              : order.status === "picked_up" ? "bg-green-100 text-green-700"
              : "bg-gray-200 text-gray-600")}
          >
            {order.status.replace("_", " ").toUpperCase()}
          </span>
        </div>

        <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
          {order.items.map((it, i) => (
            <div key={i} className="flex justify-between py-1">
              <span>
                {(it.name ?? "Item")}{it.qty ? " × " + it.qty : ""}
              </span>
              <span>${(((it.price_cents ?? 0) * (it.qty ?? 1)) / 100).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold pt-2 mt-1 border-t border-gray-100">
            <span>Subtotal</span>
            <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
          </div>
        </div>

        {order.customer_notes && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
            <span className="font-semibold">Notes: </span>
            {order.customer_notes}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={pending || primaryNext === null}
            onClick={() => primaryNext && transition(primaryNext)}
            className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
          >
            {NEXT_LABEL[order.status]}
          </button>
          <div className="flex gap-2">
            <a
              href={"tel:" + order.customer_phone}
              className="flex-1 text-center text-sm font-medium text-[color:var(--admin-primary)] border border-[color:var(--admin-primary)] rounded-lg py-2"
            >
              📞 Call
            </a>
            {canCancel && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm("Cancel this order?")) transition("canceled");
                }}
                className="flex-1 text-sm font-medium text-red-600 border border-red-600 rounded-lg py-2 disabled:opacity-50"
              >
                Cancel order
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

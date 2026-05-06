"use client";

import { useState } from "react";
import { normalizeCashapp } from "@/lib/deposit-payment-methods";

export interface DepositSettingsState {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_cashapp: string | null;
  deposit_zelle: string | null;
  deposit_other_label: string | null;
  deposit_other_value: string | null;
}

interface DepositEditorProps {
  value: DepositSettingsState;
  onChange: (next: DepositSettingsState) => void;
}

export function DepositEditor({ value, onChange }: DepositEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const required = value.deposit_required;
  const mode = value.deposit_mode ?? "fixed";
  const numericValue = value.deposit_value ?? "";
  const cashapp = value.deposit_cashapp ?? "";
  const zelle = value.deposit_zelle ?? "";
  const otherLabel = value.deposit_other_label ?? "";
  const otherValue = value.deposit_other_value ?? "";

  const methodCount =
    (cashapp ? 1 : 0) + (zelle ? 1 : 0) + (otherLabel && otherValue ? 1 : 0);

  // Collapsed + nothing configured → "+ Require a deposit" prompt.
  if (!expanded && !required) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-[1.75rem] border border-warm-cream1 bg-white p-4 text-left text-sm font-bold text-warm-textMuted transition hover:border-pink-200"
      >
        <span className="font-black text-warm-deep">+ Require a deposit</span>
        <span className="mt-0.5 block text-xs text-warm-textMuted">
          Customers pay before their booking is confirmed. Off-platform (Cash App, Zelle) — you mark it received.
        </span>
      </button>
    );
  }

  // Collapsed + deposit configured → summary card.
  if (!expanded) {
    const displayValue = mode === "fixed" ? `$${numericValue}` : `${numericValue}%`;
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-[1.75rem] border border-warm-cream1 bg-white p-4 text-left transition hover:border-pink-200"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">Deposit</span>
          <span className="text-xs font-black text-pop-pink">Edit ▾</span>
        </div>
        <p className="mt-1 text-sm font-bold text-warm-textMuted">
          <strong>{displayValue}</strong> required ({mode === "fixed" ? "flat" : "of service total"})
          {methodCount > 0 ? ` · ${methodCount} payment method${methodCount === 1 ? "" : "s"}` : ""}
        </p>
      </button>
    );
  }

  // Expanded.
  return (
    <div className="space-y-3 rounded-[1.75rem] border border-warm-cream1 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">Deposit</span>
        <button type="button" onClick={() => setExpanded(false)} className="text-xs font-black text-pop-pink">
          Done ▴
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({
              ...value,
              deposit_required: checked,
              ...(checked ? { deposit_mode: value.deposit_mode ?? "fixed" } : {}),
            });
          }}
          className="h-4 w-4"
        />
        <span className="font-bold text-warm-deep">Require deposit</span>
      </label>

      {required && (
        <>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "fixed"}
                onChange={() => onChange({ ...value, deposit_mode: "fixed" })}
              />
              <span>Fixed amount</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={mode === "percent"}
                onChange={() => onChange({ ...value, deposit_mode: "percent" })}
              />
              <span>Percentage</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {mode === "fixed" ? (
              <>
                <span className="text-sm text-warm-textMuted">$</span>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  inputMode="decimal"
                  value={numericValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...value, deposit_value: v === "" ? null : parseFloat(v) });
                  }}
                  placeholder="40"
                  className="w-24 rounded border border-warm-cream1 px-2 py-1 text-sm"
                />
              </>
            ) : (
              <>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  value={numericValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...value, deposit_value: v === "" ? null : parseInt(v, 10) });
                  }}
                  placeholder="20"
                  className="w-20 rounded border border-warm-cream1 px-2 py-1 text-sm"
                />
                <span className="text-sm text-warm-textMuted">% of service total</span>
              </>
            )}
          </div>

          <div className="border-t border-warm-cream1 pt-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-pop-pink">
              Payment methods
            </div>
            <p className="text-xs text-warm-textMuted">
              Fill in only the ones you accept. Customers will see what you provide.
            </p>

            <label className="block">
              <span className="block text-xs text-warm-textMuted mb-1">CashApp</span>
              <div className="flex items-center rounded border border-warm-cream1 overflow-hidden">
                <span className="border-r border-warm-cream1 bg-warm-cream2 px-2 py-1 text-sm text-warm-textMuted">$</span>
                <input
                  type="text"
                  value={cashapp}
                  onChange={(e) =>
                    onChange({ ...value, deposit_cashapp: normalizeCashapp(e.target.value) })
                  }
                  placeholder="cashtag"
                  className="flex-1 px-2 py-1 text-sm focus:outline-none"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs text-warm-textMuted mb-1">Zelle (phone or email)</span>
              <input
                type="text"
                value={zelle}
                onChange={(e) => onChange({ ...value, deposit_zelle: e.target.value })}
                placeholder="(555) 123-4567 or you@example.com"
                className="w-full rounded border border-warm-cream1 px-2 py-1 text-sm"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>

            <div>
              <span className="block text-xs text-warm-textMuted mb-1">Other (optional)</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={otherLabel}
                  onChange={(e) => onChange({ ...value, deposit_other_label: e.target.value })}
                  placeholder="Venmo"
                  className="rounded border border-warm-cream1 px-2 py-1 text-sm"
                  autoCapitalize="off"
                  spellCheck={false}
                />
                <input
                  type="text"
                  value={otherValue}
                  onChange={(e) => onChange({ ...value, deposit_other_value: e.target.value })}
                  placeholder="@handle"
                  className="rounded border border-warm-cream1 px-2 py-1 text-sm"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

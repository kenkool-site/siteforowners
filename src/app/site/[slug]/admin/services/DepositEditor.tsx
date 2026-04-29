"use client";

import { useState } from "react";

export interface DepositSettingsState {
  deposit_required: boolean;
  deposit_mode: "fixed" | "percent" | null;
  deposit_value: number | null;
  deposit_instructions: string | null;
}

interface DepositEditorProps {
  value: DepositSettingsState;
  onChange: (next: DepositSettingsState) => void;
}

const MAX_INSTRUCTIONS = 1000;

export function DepositEditor({ value, onChange }: DepositEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const required = value.deposit_required;
  const mode = value.deposit_mode ?? "fixed";
  const numericValue = value.deposit_value ?? "";
  const instructions = value.deposit_instructions ?? "";

  // Collapsed + nothing configured → "+ Require a deposit" prompt.
  if (!expanded && !required) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left text-sm text-gray-600 hover:border-gray-300"
      >
        <span className="font-semibold text-gray-700">+ Require a deposit</span>
        <span className="block text-xs text-gray-500 mt-0.5">
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
        className="w-full bg-white border border-gray-200 rounded-lg p-3 text-left hover:border-gray-300"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Deposit</span>
          <span className="text-xs text-[var(--admin-primary)] font-medium">Edit ▾</span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          <strong>{displayValue}</strong> required ({mode === "fixed" ? "flat" : "of service total"})
        </p>
      </button>
    );
  }

  // Expanded.
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Deposit</span>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs text-[var(--admin-primary)] font-medium"
        >
          Done ▴
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => onChange({ ...value, deposit_required: e.target.checked })}
          className="h-4 w-4"
        />
        <span className="font-medium text-gray-700">Require deposit</span>
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
                <span className="text-sm text-gray-500">$</span>
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
                  className="w-24 rounded border border-gray-200 px-2 py-1 text-sm"
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
                  className="w-20 rounded border border-gray-200 px-2 py-1 text-sm"
                />
                <span className="text-sm text-gray-500">% of service total</span>
              </>
            )}
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Payment instructions
            </label>
            <textarea
              value={instructions}
              onChange={(e) =>
                onChange({ ...value, deposit_instructions: e.target.value.slice(0, MAX_INSTRUCTIONS) })
              }
              placeholder={"e.g.\nCash App: $letstrylocs\nZelle: (555) 123-4567"}
              rows={4}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm font-mono leading-snug"
            />
            <div className="text-[10px] text-gray-500 mt-1">
              Shown prominently to customers when they book. Be specific.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

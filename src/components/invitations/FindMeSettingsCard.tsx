"use client";

import { useState } from "react";

export function FindMeSettingsCard({ initialDailySearchLimit }: { initialDailySearchLimit: number }) {
  const [value, setValue] = useState(String(initialDailySearchLimit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError(true);
      setSaved(false);
      return;
    }
    setSaving(true);
    setError(false);
    setSaved(false);
    try {
      const response = await fetch("/api/invitations/admin/find-me-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dailySearchLimit: parsed }),
      });
      if (!response.ok) throw new Error(`settings ${response.status}`);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-gray-950">Find Me search limit</h2>
      <p className="mt-1 text-sm text-gray-500">
        Max AI face-search attempts allowed per guest per event, every 24 hours. Each search runs one AWS Rekognition
        comparison per photo it checks, so this caps the worst-case cost from a single guest. Applies platform-wide,
        across every event.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="number"
          min={1}
          max={1000}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
          }}
          className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {saved && <span className="text-sm font-medium text-emerald-700">Saved</span>}
        {error && <span className="text-sm font-medium text-red-700">Could not save. Check the value and try again.</span>}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

const CATEGORIES = [
  { value: "hours", label: "Hours" },
  { value: "photo", label: "Photo / image" },
  { value: "service", label: "Service" },
  { value: "pricing", label: "Pricing" },
  { value: "text", label: "Text / wording" },
  { value: "other", label: "Other" },
];

export function NewUpdateRequestForm() {
  const [category, setCategory] = useState("hours");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (description.trim().length < 5) {
      setError("Please describe what needs to change (at least 5 characters)");
      return;
    }
    setPending(true);
    try {
      let attachmentUrl: string | null = null;
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const upRes = await fetch("/api/admin/updates/attachment", { method: "POST", body: fd });
        if (!upRes.ok) {
          const d = await upRes.json().catch(() => ({}));
          setError(d?.error || "Photo upload failed");
          return;
        }
        const upData = await upRes.json();
        attachmentUrl = upData.url ?? null;
      }

      const res = await fetch("/api/admin/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, description: description.trim(), attachmentUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || "Could not submit");
        return;
      }
      window.location.href = "/admin/updates";
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          What needs to change?
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          Describe the change
        </div>
        <textarea
          rows={5}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Change Tuesday hours to 11–7..."
          className="w-full bg-white border border-gray-300 rounded-lg py-2 px-3 text-sm"
          maxLength={5000}
        />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">
          Attach photo (optional)
        </div>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm"
        />
        {file && <div className="text-xs text-gray-500 mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
      </div>

      {error && <div className="text-red-600 text-sm" role="alert">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-[var(--admin-primary)] text-white font-medium py-3 rounded-lg disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send request"}
      </button>
    </form>
  );
}

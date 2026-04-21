"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { TemplateOrchestrator } from "@/components/templates";

interface SiteEditorProps {
  tenant: Record<string, unknown>;
  preview: Record<string, unknown>;
}

interface ServiceItem {
  name: string;
  price: string;
  description?: string;
}

interface ProductItem {
  name: string;
  price: string;
  description?: string;
  image?: string;
}

export function SiteEditor({ tenant, preview }: SiteEditorProps) {
  const slug = preview.slug as string;
  const copy = (preview.generated_copy || {}) as Record<string, unknown>;
  const enCopy = (copy.en || {}) as Record<string, unknown>;

  // Editable state
  const [businessName, setBusinessName] = useState(preview.business_name as string);
  const [phone, setPhone] = useState((preview.phone as string) || "");
  const [address, setAddress] = useState((preview.address as string) || "");
  const [bookingUrl, setBookingUrl] = useState((preview.booking_url as string) || "");

  // Copy
  const [headline, setHeadline] = useState((enCopy.hero_headline as string) || "");
  const [subheadline, setSubheadline] = useState((enCopy.hero_subheadline as string) || "");
  const [aboutParagraphs, setAboutParagraphs] = useState<string[]>(
    (enCopy.about_paragraphs as string[]) || []
  );
  const [footerTagline, setFooterTagline] = useState((enCopy.footer_tagline as string) || "");

  // Services
  const [services, setServices] = useState<ServiceItem[]>(
    (preview.services as ServiceItem[]) || []
  );

  // Products
  const [products, setProducts] = useState<ProductItem[]>(
    (preview.products as ProductItem[]) || []
  );

  // Images
  const [images, setImages] = useState<string[]>((preview.images as string[]) || []);

  // Section settings
  const existingSettings = (copy.section_settings || {}) as Record<string, unknown>;
  const [sectionSettings, setSectionSettings] = useState({
    show_gallery: existingSettings.show_gallery !== false,
    show_about: existingSettings.show_about !== false,
    show_about_image: existingSettings.show_about_image !== false,
    show_services: existingSettings.show_services !== false,
    show_products: existingSettings.show_products !== false,
    show_booking: existingSettings.show_booking !== false,
    show_contact: existingSettings.show_contact !== false,
    show_map: existingSettings.show_map !== false,
    show_testimonials: existingSettings.show_testimonials !== false,
    show_rating: existingSettings.show_rating !== false,
    about_image_url: (existingSettings.about_image_url as string) || "",
    template_override: (existingSettings.template_override as string) || "",
  });

  const toggleSection = (key: string) => {
    setSectionSettings((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  // Booking settings
  const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const tenantId = tenant.id as string;
  const isRealTenant = !tenantId.startsWith("preview-");
  const previewSlugStr = preview.slug as string;
  const previewHours = (preview.hours || {}) as Record<string, { open: string; close: string; closed?: boolean }>;

  const defaultWorkingHours: Record<string, { open: string; close: string } | null> = {};
  for (const day of DAYS_OF_WEEK) {
    const h = previewHours[day];
    if (h && !h.closed) {
      defaultWorkingHours[day] = { open: h.open || "10:00 AM", close: h.close || "7:00 PM" };
    } else if (day === "Sunday") {
      defaultWorkingHours[day] = null;
    } else {
      defaultWorkingHours[day] = { open: "10:00 AM", close: day === "Saturday" ? "5:00 PM" : "7:00 PM" };
    }
  }

  const [workingHours, setWorkingHours] = useState<Record<string, { open: string; close: string } | null>>(defaultWorkingHours);
  const [slotDuration, setSlotDuration] = useState(60);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [maxPerSlot, setMaxPerSlot] = useState(1);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [bookingSettingsLoaded, setBookingSettingsLoaded] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);

  // Load booking settings (only for real tenants)
  useEffect(() => {
    if (!isRealTenant) { setBookingSettingsLoaded(true); return; }
    (async () => {
      try {
        const res = await fetch(`/api/booking-settings?tenant_id=${tenantId}`);
        const data = await res.json();
        if (data.working_hours) setWorkingHours(data.working_hours);
        if (data.slot_duration) setSlotDuration(data.slot_duration);
        if (data.buffer_minutes !== undefined) setBufferMinutes(data.buffer_minutes);
        if (data.max_per_slot) setMaxPerSlot(data.max_per_slot);
        if (data.blocked_dates) setBlockedDates(data.blocked_dates);
      } catch { /* use defaults */ }
      setBookingSettingsLoaded(true);
    })();
  }, [tenantId, isRealTenant]);

  const saveBookingSettings = async () => {
    setSavingBooking(true);
    try {
      await fetch("/api/booking-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          preview_slug: previewSlugStr,
          slot_duration: slotDuration,
          buffer_minutes: bufferMinutes,
          max_per_slot: maxPerSlot,
          working_hours: workingHours,
          blocked_dates: blockedDates,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save booking settings");
    } finally {
      setSavingBooking(false);
    }
  };

  // AI instructions
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [keepColors, setKeepColors] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const res = await fetch("/api/update-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          updates: {
            business_name: businessName,
            phone,
            address,
            booking_url: bookingUrl || null,
            services: services.filter((s) => s.name.trim()),
            products: products.filter((p) => p.name.trim()),
            images,
            generated_copy: {
              en: {
                hero_headline: headline,
                hero_subheadline: subheadline,
                about_paragraphs: aboutParagraphs,
                footer_tagline: footerTagline,
              },
              section_settings: {
                ...sectionSettings,
                about_image_url: sectionSettings.about_image_url || null,
                template_override: sectionSettings.template_override || null,
              },
            },
          },
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError("");
    try {
      const res = await fetch("/api/regenerate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          instructions: aiPrompt.trim() || undefined,
          keep_colors: keepColors,
        }),
      });
      if (!res.ok) throw new Error("Regeneration failed");
      const data = await res.json();
      window.location.href = `/preview/compare/${data.group_id}`;
    } catch {
      setError("Failed to regenerate. Try again.");
      setRegenerating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("images", f));
    try {
      const res = await fetch("/api/upload-images", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImages((prev) => [...prev, ...data.urls]);
    } catch {
      setError("Image upload failed");
    }
  };

  // Build preview data for live preview
  const previewData = {
    ...preview,
    business_name: businessName,
    phone,
    address,
    booking_url: bookingUrl,
    services: services.filter((s) => s.name.trim()),
    products: products.filter((p) => p.name.trim()),
    images,
    generated_copy: {
      ...copy,
      en: {
        ...enCopy,
        hero_headline: headline,
        hero_subheadline: subheadline,
        about_paragraphs: aboutParagraphs,
        footer_tagline: footerTagline,
      },
      section_settings: {
        ...sectionSettings,
        about_image_url: sectionSettings.about_image_url || null,
        template_override: sectionSettings.template_override || null,
      },
    },
  };

  const tabs = [
    { id: "edit" as const, label: "Edit" },
    { id: "preview" as const, label: "Live Preview" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Site — {tenant.business_name as string}
          </h1>
          {typeof tenant.subdomain === "string" && tenant.subdomain && (
            <p className="mt-1 text-sm text-gray-400">
              {tenant.subdomain}.siteforowners.com
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm font-medium text-green-600">Saved!</span>
          )}
          {error && (
            <span className="text-sm font-medium text-red-600">{error}</span>
          )}
          <Button
            onClick={() => setShowAiPrompt(!showAiPrompt)}
            disabled={regenerating || saving}
            variant="outline"
            className="text-amber-600 border-amber-300 hover:bg-amber-50"
          >
            {regenerating ? "Regenerating..." : "AI Regenerate"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || regenerating}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* AI Instructions Panel */}
      {showAiPrompt && (
        <div className="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3 className="text-sm font-semibold text-amber-900">AI Instructions</h3>
          </div>
          <p className="mb-3 text-xs text-amber-800">
            Tell the AI what you want changed. It&apos;ll generate new variants to compare — your current site stays live until you pick one.
          </p>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. Make the tone more luxurious and upscale, use darker colors, emphasize the VIP experience..."
            rows={3}
            className="mb-3 w-full resize-none rounded-lg border border-amber-300 bg-white px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                "Make it more luxurious",
                "More casual and friendly",
                "Emphasize speed and convenience",
                "Focus on family and community",
                "Make colors darker",
                "Use a softer, feminine tone",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setAiPrompt(suggestion)}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs text-amber-700 hover:bg-amber-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
          {/* Keep colors toggle */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-amber-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Keep current colors</p>
              <p className="text-xs text-gray-500">Preserve the existing color theme during regeneration</p>
            </div>
            <button
              onClick={() => setKeepColors(!keepColors)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                keepColors ? "bg-amber-600" : "bg-gray-300"
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                keepColors ? "translate-x-6" : "translate-x-1"
              }`} />
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {regenerating ? "Generating..." : "Generate New Variants"}
            </Button>
            <button
              onClick={() => { setShowAiPrompt(false); setAiPrompt(""); }}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab toggle */}
      <div className="mb-6 flex rounded-lg border bg-gray-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "edit" ? (
        <div className="space-y-8">
          {/* Hero */}
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Hero Section</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Headline</label>
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Subheadline</label>
                <input
                  type="text"
                  value={subheadline}
                  onChange={(e) => setSubheadline(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Section Visibility & Layout */}
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Section Visibility</h2>
            <p className="mb-4 text-xs text-gray-500">Toggle sections on/off. Changes show in Live Preview.</p>
            <div className="space-y-2">
              {[
                { key: "show_services", label: "Services" },
                { key: "show_gallery", label: "Gallery" },
                { key: "show_about", label: "About Us" },
                { key: "show_about_image", label: "About Image" },
                { key: "show_products", label: "Products" },
                { key: "show_booking", label: "Booking" },
                { key: "show_testimonials", label: "Testimonials" },
                { key: "show_rating", label: "Rating Badge" },
                { key: "show_contact", label: "Contact Form" },
                { key: "show_map", label: "Map" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between rounded-lg border px-4 py-2.5">
                  <span className="text-sm text-gray-700">{label}</span>
                  <button
                    onClick={() => toggleSection(key)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      sectionSettings[key as keyof typeof sectionSettings] ? "bg-green-500" : "bg-gray-300"
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      sectionSettings[key as keyof typeof sectionSettings] ? "translate-x-[18px]" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
              ))}
            </div>

            {/* Template override */}
            <div className="mt-5">
              <label className="mb-1 block text-sm font-medium text-gray-700">Template Style</label>
              <select
                value={sectionSettings.template_override}
                onChange={(e) => setSectionSettings((prev) => ({ ...prev, template_override: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="">Default ({preview.template_variant as string || "classic"})</option>
                <option value="classic">Classic</option>
                <option value="bold">Bold</option>
                <option value="elegant">Elegant</option>
                <option value="vibrant">Vibrant</option>
                <option value="warm">Warm</option>
              </select>
            </div>

            {/* Custom about image */}
            {sectionSettings.show_about && sectionSettings.show_about_image && (
              <div className="mt-5">
                <label className="mb-1 block text-sm font-medium text-gray-700">Custom About Image</label>
                <div className="flex items-center gap-3">
                  {sectionSettings.about_image_url ? (
                    <div className="relative h-14 w-14 overflow-hidden rounded-lg border">
                      <Image src={sectionSettings.about_image_url} alt="" fill className="object-cover" unoptimized />
                      <button onClick={() => setSectionSettings((prev) => ({ ...prev, about_image_url: "" }))}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">×</button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-gray-500 hover:border-amber-400 hover:text-amber-600">
                      Upload image
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append("images", file);
                        const res = await fetch("/api/upload-images", { method: "POST", body: fd });
                        if (res.ok) {
                          const d = await res.json();
                          if (d.urls?.[0]) setSectionSettings((prev) => ({ ...prev, about_image_url: d.urls[0] }));
                        }
                      }} />
                    </label>
                  )}
                  <span className="text-xs text-gray-400">Replaces default about photo</span>
                </div>
              </div>
            )}
          </section>

          {/* Business Info */}
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Business Info</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Business Name</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Booking URL</label>
                <input
                  type="url"
                  value={bookingUrl}
                  onChange={(e) => setBookingUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* About */}
          <section className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">About Section</h2>
            <div className="space-y-3">
              {aboutParagraphs.map((p, i) => (
                <div key={i}>
                  <label className="mb-1 block text-xs font-medium text-gray-400">
                    Paragraph {i + 1}
                  </label>
                  <textarea
                    value={p}
                    onChange={(e) => {
                      const updated = [...aboutParagraphs];
                      updated[i] = e.target.value;
                      setAboutParagraphs(updated);
                    }}
                    rows={3}
                    className="w-full resize-none rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Footer Tagline</label>
                <input
                  type="text"
                  value={footerTagline}
                  onChange={(e) => setFooterTagline(e.target.value)}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </section>

          {/* Services */}
          <section className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Services</h2>
              <button
                onClick={() => setServices((prev) => [...prev, { name: "", price: "" }])}
                className="text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {services.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setServices(updated);
                    }}
                    placeholder="Service name"
                    className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={s.price}
                    onChange={(e) => {
                      const updated = [...services];
                      updated[i] = { ...updated[i], price: e.target.value };
                      setServices(updated);
                    }}
                    placeholder="$0"
                    className="w-24 rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setServices((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Products */}
          <section className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Products</h2>
              <button
                onClick={() => setProducts((prev) => [...prev, { name: "", price: "" }])}
                className="text-sm font-medium text-amber-600 hover:text-amber-700"
              >
                + Add
              </button>
            </div>
            <div className="space-y-3">
              {products.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  {p.image && (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                      <Image src={p.image} alt={p.name} fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => {
                      const updated = [...products];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setProducts(updated);
                    }}
                    placeholder="Product name"
                    className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={p.price}
                    onChange={(e) => {
                      const updated = [...products];
                      updated[i] = { ...updated[i], price: e.target.value };
                      setProducts(updated);
                    }}
                    placeholder="$0"
                    className="w-24 rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => setProducts((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {products.length === 0 && (
                <p className="text-sm text-gray-400">No products. Click + Add to create one.</p>
              )}
            </div>
          </section>

          {/* Images */}
          <section className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
              <label className="cursor-pointer text-sm font-medium text-amber-600 hover:text-amber-700">
                + Upload
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            </div>
            <p className="mb-2 text-xs text-gray-400">Click any image to set it as the hero background.</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div
                  key={i}
                  className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                    i === 0 ? "border-amber-500 ring-2 ring-amber-500/30" : "border-transparent hover:border-gray-300"
                  }`}
                  onClick={() => {
                    if (i === 0) return;
                    setImages((prev) => {
                      const updated = [...prev];
                      const [selected] = updated.splice(i, 1);
                      updated.unshift(selected);
                      return updated;
                    });
                  }}
                >
                  <Image src={img} alt="" fill className="object-cover" unoptimized />
                  {i === 0 && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      Hero
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setImages((prev) => prev.filter((_, j) => j !== i)); }}
                    className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow group-hover:flex"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Booking Settings — only for real tenants */}
          {isRealTenant && bookingSettingsLoaded && (
            <section className="rounded-xl border bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Booking Settings</h2>
                <button
                  onClick={saveBookingSettings}
                  disabled={savingBooking}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {savingBooking ? "Saving..." : "Save Booking Settings"}
                </button>
              </div>

              {/* Slot config */}
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Slot Duration</label>
                  <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Buffer Between</label>
                  <select value={bufferMinutes} onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value={0}>No buffer</option>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Max Per Slot</label>
                  <select value={maxPerSlot} onChange={(e) => setMaxPerSlot(Number(e.target.value))}
                    className="w-full rounded-lg border px-3 py-2 text-sm">
                    <option value={1}>1 (solo)</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                    <option value={5}>5</option>
                  </select>
                </div>
              </div>

              {/* Working hours */}
              <h3 className="mb-3 text-sm font-medium text-gray-700">Working Hours</h3>
              <div className="mb-6 space-y-2">
                {DAYS_OF_WEEK.map((day) => {
                  const isOpen = workingHours[day] !== null;
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <button
                        onClick={() => setWorkingHours((prev) => ({ ...prev, [day]: isOpen ? null : { open: "10:00 AM", close: "7:00 PM" } }))}
                        className={`w-20 shrink-0 text-left text-sm font-medium ${isOpen ? "text-gray-900" : "text-gray-400 line-through"}`}
                      >
                        {day.slice(0, 3)}
                      </button>
                      {isOpen ? (
                        <div className="flex items-center gap-2">
                          <input type="text" value={workingHours[day]?.open || ""}
                            onChange={(e) => setWorkingHours((prev) => ({ ...prev, [day]: { ...prev[day]!, open: e.target.value } }))}
                            className="w-24 rounded border px-2 py-1 text-xs" placeholder="10:00 AM" />
                          <span className="text-xs text-gray-400">to</span>
                          <input type="text" value={workingHours[day]?.close || ""}
                            onChange={(e) => setWorkingHours((prev) => ({ ...prev, [day]: { ...prev[day]!, close: e.target.value } }))}
                            className="w-24 rounded border px-2 py-1 text-xs" placeholder="7:00 PM" />
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Closed</span>
                      )}
                      <button onClick={() => setWorkingHours((prev) => ({ ...prev, [day]: isOpen ? null : { open: "10:00 AM", close: "7:00 PM" } }))}
                        className={`ml-auto rounded px-2 py-0.5 text-xs ${isOpen ? "text-red-500 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}>
                        {isOpen ? "Close" : "Open"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Blocked dates */}
              <h3 className="mb-2 text-sm font-medium text-gray-700">Blocked Dates</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                {blockedDates.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs text-red-700">
                    {d}
                    <button onClick={() => setBlockedDates((prev) => prev.filter((x) => x !== d))} className="hover:text-red-900">×</button>
                  </span>
                ))}
              </div>
              <input
                type="date"
                className="rounded-lg border px-3 py-2 text-sm"
                onChange={(e) => {
                  if (e.target.value && !blockedDates.includes(e.target.value)) {
                    setBlockedDates((prev) => [...prev, e.target.value]);
                  }
                  e.target.value = "";
                }}
              />
              <p className="mt-1 text-xs text-gray-400">Pick dates to block (vacation, holidays)</p>
            </section>
          )}
        </div>
      ) : (
        /* Live Preview */
        <div className="overflow-hidden rounded-xl border bg-white shadow-lg">
          <TemplateOrchestrator
            data={previewData as never}
            locale="en"
          />
        </div>
      )}
    </div>
  );
}

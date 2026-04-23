"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { TemplateOrchestrator } from "@/components/templates";
import {
  DEFAULT_HOURS,
  getHoursSource,
  parseGoogleHoursString,
} from "@/lib/defaults/businessHours";
import type { BusinessHours } from "@/lib/ai/types";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

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

function labelForSource(source: "booking" | "google" | "custom" | "default"): string {
  switch (source) {
    case "booking":
      return "Booking schedule (overrides display hours)";
    case "google":
      return "From Google Maps";
    case "custom":
      return "Custom";
    case "default":
      return "Default";
  }
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
  const [bookingIntro, setBookingIntro] = useState((enCopy.booking_intro as string) || "");

  // Services
  const [services, setServices] = useState<ServiceItem[]>(
    (preview.services as ServiceItem[]) || []
  );

  // Products
  const [products, setProducts] = useState<ProductItem[]>(
    (preview.products as ProductItem[]) || []
  );

  // Tenant-level settings (separate save path via /api/update-tenant)
  const [checkoutMode, setCheckoutMode] = useState<"mockup" | "pickup">(
    (tenant.checkout_mode as "mockup" | "pickup" | null) || "mockup"
  );
  const [notificationEmail, setNotificationEmail] = useState<string>(
    (tenant.email as string | null) || ""
  );

  // Images
  const [images, setImages] = useState<string[]>((preview.images as string[]) || []);

  // Hero background video (optional, replaces first image as hero bg when set)
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(
    (preview.hero_video_url as string | null) ?? null
  );
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

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
    disable_animations: existingSettings.disable_animations === true,
    about_image_url: (existingSettings.about_image_url as string) || "",
    template_override: (existingSettings.template_override as string) || "",
  });

  const toggleSection = (key: string) => {
    setSectionSettings((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
  };

  // Display hours (footer). Separate from booking_settings.working_hours.
  const initialDisplayHours: BusinessHours =
    (preview.hours as BusinessHours) ||
    DEFAULT_HOURS;
  const [displayHours, setDisplayHours] = useState<BusinessHours>(initialDisplayHours);
  const [importedHours, setImportedHours] = useState<BusinessHours | null>(
    (preview.imported_hours as BusinessHours) || null
  );
  const [showHoursOnSite, setShowHoursOnSite] = useState<boolean>(
    existingSettings.show_hours !== false
  );

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

    const pickupNeedsEmail = checkoutMode === "pickup" && !notificationEmail.trim();
    if (pickupNeedsEmail) {
      setError("Notification email required for pickup mode.");
      setSaving(false);
      return;
    }

    try {
      // Tenant-level settings only apply to real tenants. Preview-only slugs
      // (no paying tenant yet) skip the /api/update-tenant call — their
      // synthetic tenant id isn't a valid UUID.
      const previewPromise = fetch("/api/update-site", {
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
            hero_video_url: heroVideoUrl,
            hours: displayHours,
            imported_hours: importedHours,
            generated_copy: {
              en: {
                hero_headline: headline,
                hero_subheadline: subheadline,
                about_paragraphs: aboutParagraphs,
                footer_tagline: footerTagline,
                booking_intro: bookingIntro.trim() || null,
              },
              section_settings: {
                ...sectionSettings,
                show_hours: showHoursOnSite,
                about_image_url: sectionSettings.about_image_url || null,
                template_override: sectionSettings.template_override || null,
              },
            },
          },
        }),
      });
      const tenantPromise: Promise<Response | null> = isRealTenant
        ? fetch("/api/update-tenant", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenant_id: tenant.id as string,
              updates: {
                checkout_mode: checkoutMode,
                email: notificationEmail.trim() || null,
              },
            }),
          })
        : Promise.resolve(null);
      const [previewRes, tenantRes] = await Promise.all([previewPromise, tenantPromise]);

      if (!previewRes.ok) throw new Error("Preview save failed");
      if (tenantRes && !tenantRes.ok) {
        const detail = await tenantRes.json().catch(() => ({}));
        throw new Error(detail?.error || "Tenant save failed");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
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

  const [applying, setApplying] = useState(false);
  const [reimporting, setReimporting] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);

  const handleReimport = async () => {
    if (!bookingUrl.trim()) { setError("Enter a booking URL first"); return; }
    setReimporting(true);
    setError("");
    try {
      const res = await fetch("/api/import-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: bookingUrl.trim() }),
      });
      if (!res.ok) throw new Error("Import failed");
      const d = await res.json();
      if (d.services?.length > 0) setServices(d.services);
      if (d.images?.length > 0) {
        setImages((prev) => {
          const existing = new Set(prev);
          const newImgs = (d.images as string[]).filter((img: string) => !existing.has(img));
          return [...prev, ...newImgs];
        });
      }
      if (d.phone && !phone) setPhone(d.phone);
      if (d.address && !address) setAddress(d.address);
      if (d.business_name && businessName === "Unknown") setBusinessName(d.business_name);

      // Persist booking_categories immediately — it's derived from Acuity, not
      // user-editable, so no need to wait for the next Save click.
      if (d.booking_categories) {
        const persistRes = await fetch("/api/update-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            updates: { generated_copy: { booking_categories: d.booking_categories } },
          }),
        });
        if (!persistRes.ok) {
          console.error("Failed to persist booking_categories after re-import");
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to import from booking URL");
    } finally {
      setReimporting(false);
    }
  };

  const handleMapsEnrich = async () => {
    if (!businessName.trim() || !address.trim()) { setError("Business name and address required"); return; }
    setMapsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/import-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName.trim(), address: address.trim() }),
      });
      if (!res.ok) throw new Error("Maps lookup failed");
      const d = await res.json();
      // Merge new images
      if (d.images?.length > 0) {
        setImages((prev) => {
          const existing = new Set(prev);
          const newImgs = (d.images as string[]).filter((img: string) => !existing.has(img));
          return [...prev, ...newImgs];
        });
      }
      if (d.phone && !phone) setPhone(d.phone);
      if (d.services?.length > 0 && services.length === 0) setServices(d.services);
      if (d.hours) {
        const parsed = parseGoogleHoursString(d.hours);
        if (Object.keys(parsed).length > 0) {
          setDisplayHours(parsed);
          setImportedHours(parsed);
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to fetch Google Maps data");
    } finally {
      setMapsLoading(false);
    }
  };

  const handleAiApply = async () => {
    if (!aiPrompt.trim()) return;
    setApplying(true);
    setError("");
    try {
      const currentCopy = {
        hero_headline: headline,
        hero_subheadline: subheadline,
        about_paragraphs: aboutParagraphs,
        footer_tagline: footerTagline,
      };
      const res = await fetch("/api/ai-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: aiPrompt.trim(),
          current_copy: currentCopy,
        }),
      });
      if (!res.ok) throw new Error("AI edit failed");
      const data = await res.json();
      const updated = data.copy;
      if (updated.hero_headline) setHeadline(updated.hero_headline);
      if (updated.hero_subheadline) setSubheadline(updated.hero_subheadline);
      if (updated.about_paragraphs) setAboutParagraphs(updated.about_paragraphs);
      if (updated.footer_tagline) setFooterTagline(updated.footer_tagline);
      setShowAiPrompt(false);
      setAiPrompt("");
    } catch {
      setError("AI edit failed. Try again.");
    } finally {
      setApplying(false);
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

  const MAX_VIDEO_SIZE = 20 * 1024 * 1024;

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);

    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setVideoError("Use MP4 or WebM.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 20MB — compress first.`);
      e.target.value = "";
      return;
    }

    setUploadingVideo(true);
    try {
      // 1. Get a signed upload URL from our admin-gated API (tiny payload).
      const signRes = await fetch("/api/upload-hero-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: file.type, size: file.size }),
      });
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to prepare upload");
      }
      const { path, token, publicUrl } = await signRes.json();

      // 2. Upload the file directly to Supabase Storage.
      // This bypasses Vercel's 4.5MB serverless payload limit.
      const client = createBrowserSupabase();
      const { error: uploadError } = await client.storage
        .from("preview-images")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      setHeroVideoUrl(publicUrl);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideo(false);
      e.target.value = "";
    }
  };

  const handleRemoveVideo = () => {
    setHeroVideoUrl(null);
    setVideoError(null);
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
    hero_video_url: heroVideoUrl,
    hours: displayHours,
    imported_hours: importedHours,
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
        show_hours: showHoursOnSite,
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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={handleAiApply}
              disabled={applying || !aiPrompt.trim()}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {applying ? "Applying..." : "Apply & Preview"}
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={regenerating || applying}
              variant="outline"
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
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
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Hero background video (optional)</label>
                <p className="mb-2 text-xs text-gray-500">
                  MP4 or WebM, under 20MB, ~10-20 seconds. Muted auto-loop. Only applies to Classic, Bold, and Warm templates. Leave empty to use the first hero image instead.
                </p>
                {heroVideoUrl ? (
                  <div className="space-y-2">
                    <video
                      src={heroVideoUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="w-full max-w-md rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveVideo}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove video
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={handleVideoUpload}
                    disabled={uploadingVideo}
                    className="block w-full text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-amber-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-amber-700 hover:file:bg-amber-100 disabled:opacity-50"
                  />
                )}
                {uploadingVideo && <p className="mt-2 text-xs text-gray-500">Uploading…</p>}
                {videoError && <p className="mt-2 text-xs text-red-600">{videoError}</p>}
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
                { key: "disable_animations", label: "Disable Scroll Animations", inverted: true },
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
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-600">
                  Booking notes <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={bookingIntro}
                  onChange={(e) => setBookingIntro(e.target.value)}
                  placeholder="e.g. A $40 deposit is required to confirm your appointment. You'll complete booking securely below."
                  rows={3}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Shown above the booking iframe when a customer clicks a service card. Deposit policy, reschedule rules, etc.
                </p>
              </div>
            </div>
          </section>

          {/* Re-import Data */}
          <section className="rounded-xl border border-dashed border-amber-300 bg-amber-50/30 p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Import Data</h2>
            <p className="mb-4 text-xs text-gray-500">Pull in images, services, and info from booking app or Google Maps.</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleReimport}
                disabled={reimporting || !bookingUrl.trim()}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {reimporting ? "Importing..." : "Re-import from Booking URL"}
              </button>
              <button
                onClick={handleMapsEnrich}
                disabled={mapsLoading || !businessName.trim() || !address.trim()}
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {mapsLoading ? "Fetching..." : "Fetch from Google Maps"}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              New images will be added to your gallery. Existing images won&apos;t be duplicated.
            </p>
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

        {/* ── Checkout ─────────────────────────────────────── */}
        {isRealTenant && (
        <section className="rounded-xl border bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Checkout</h3>
          <p className="mb-4 text-xs text-gray-500">
            How customers check out from this site.
          </p>

          <div className="space-y-2">
            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="checkout_mode"
                value="mockup"
                checked={checkoutMode === "mockup"}
                onChange={() => setCheckoutMode("mockup")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Mockup</p>
                <p className="text-xs text-gray-500">
                  Shows the cart UI but orders aren&apos;t collected.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="checkout_mode"
                value="pickup"
                checked={checkoutMode === "pickup"}
                onChange={() => setCheckoutMode("pickup")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Pickup — pay in store</p>
                <p className="text-xs text-gray-500">
                  Customer orders online, comes to the shop to pick up and pay.
                </p>
              </div>
            </label>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-600">
              Notification email{checkoutMode === "pickup" ? " *" : ""}
            </label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              placeholder="owner@example.com"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Where pickup orders are sent. Required when mode is Pickup.
            </p>
          </div>
        </section>
        )}

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

          {/* Display Hours (footer) */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Business Hours</h2>
                <p className="mt-1 text-xs text-gray-500">
                  Source: {labelForSource(getHoursSource(workingHours, displayHours, importedHours))}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showHoursOnSite}
                  onChange={(e) => setShowHoursOnSite(e.target.checked)}
                  className="h-4 w-4"
                />
                Show on website
              </label>
            </div>

            {bookingSettingsLoaded && Object.keys(workingHours).some((d) => workingHours[d] !== null) && (
              <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                Your booking schedule is currently displayed on the site. Edits here will only show if you
                disable the booking hours below.
              </div>
            )}

            <div className="mb-4 space-y-2">
              {DAYS_OF_WEEK.map((day) => {
                const h = displayHours[day];
                const isClosed = !!h?.closed;
                return (
                  <div key={`disp-${day}`} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm font-medium text-gray-900">
                      {day.slice(0, 3)}
                    </span>
                    {!isClosed ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={h?.open || ""}
                          onChange={(e) =>
                            setDisplayHours((prev) => ({
                              ...prev,
                              [day]: { open: e.target.value, close: prev[day]?.close || "" },
                            }))
                          }
                          className="w-24 rounded border px-2 py-1 text-xs"
                          placeholder="10:00 AM"
                        />
                        <span className="text-xs text-gray-400">to</span>
                        <input
                          type="text"
                          value={h?.close || ""}
                          onChange={(e) =>
                            setDisplayHours((prev) => ({
                              ...prev,
                              [day]: { open: prev[day]?.open || "", close: e.target.value },
                            }))
                          }
                          className="w-24 rounded border px-2 py-1 text-xs"
                          placeholder="7:00 PM"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Closed</span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setDisplayHours((prev) => ({
                          ...prev,
                          [day]: isClosed
                            ? { open: "10:00 AM", close: "7:00 PM" }
                            : { open: "", close: "", closed: true },
                        }))
                      }
                      className={`ml-auto rounded px-2 py-0.5 text-xs ${
                        isClosed
                          ? "text-green-600 hover:bg-green-50"
                          : "text-red-500 hover:bg-red-50"
                      }`}
                    >
                      {isClosed ? "Open" : "Close"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {importedHours && (
                <button
                  type="button"
                  onClick={() => setDisplayHours(importedHours)}
                  className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Reset to Google Maps
                </button>
              )}
              <button
                type="button"
                onClick={() => setDisplayHours(DEFAULT_HOURS)}
                className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                Reset to defaults
              </button>
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
            checkoutMode={checkoutMode}
          />
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
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

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

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
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((img, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border">
                  <Image src={img} alt="" fill className="object-cover" unoptimized />
                  <button
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow group-hover:flex"
                  >
                    ×
                  </button>
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      Hero
                    </span>
                  )}
                </div>
              ))}
            </div>
            {images.length > 1 && (
              <p className="mt-2 text-xs text-gray-400">
                First image is used as hero. Drag to reorder (coming soon).
              </p>
            )}
          </section>
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

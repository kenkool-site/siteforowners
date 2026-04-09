"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { DEFAULT_SERVICES } from "@/lib/templates/default-services";
import type { BusinessType, ColorTheme, ServiceItem } from "@/lib/ai/types";
import { useRouter } from "next/navigation";

const BUSINESS_TYPES: { value: BusinessType; label: string; emoji: string }[] = [
  { value: "salon", label: "Hair Salon", emoji: "💇‍♀️" },
  { value: "barbershop", label: "Barbershop", emoji: "💈" },
  { value: "restaurant", label: "Restaurant", emoji: "🍽️" },
  { value: "nails", label: "Nail Salon", emoji: "💅" },
  { value: "braids", label: "Braiding Salon", emoji: "✨" },
];

const TAGLINES: Record<BusinessType, string[]> = {
  salon: [
    "Where beauty meets confidence",
    "Your neighborhood beauty destination",
    "Look good, feel amazing",
  ],
  barbershop: [
    "Where style gets sharp",
    "Your neighborhood's best cuts",
    "Look sharp, feel confident",
  ],
  restaurant: [
    "A taste of home, every meal",
    "Your neighborhood's best kept secret",
    "Where flavor meets family",
  ],
  nails: [
    "Where every nail tells a story",
    "Treat yourself — you deserve it",
    "Glamour at your fingertips",
  ],
  braids: [
    "Crown your beauty",
    "Where culture meets style",
    "Braids that make you shine",
  ],
};

type Step = 1 | 2 | 3 | 4;

export default function PreviewWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  // Step 2
  const [colorTheme, setColorTheme] = useState<ColorTheme | "">("");
  const [tagline, setTagline] = useState("");

  // Step 3
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [address, setAddress] = useState("");

  // Step 4: Photos
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("images", file));

    try {
      const res = await fetch("/api/upload-images", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setUploadedImages((prev) => [...prev, ...data.urls]);
    } catch {
      setError("Failed to upload images. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const canAdvance = () => {
    switch (step) {
      case 1:
        return businessName.trim() && businessType;
      case 2:
        return colorTheme;
      case 3:
        return services.length > 0;
      case 4:
        return true;
    }
  };

  const initServicesForType = (type: BusinessType) => {
    setServices(DEFAULT_SERVICES[type] || []);
  };

  const handleNext = () => {
    if (step === 1 && businessType) {
      initServicesForType(businessType as BusinessType);
      const themes = THEMES_BY_VERTICAL[businessType as BusinessType];
      if (themes?.[0] && !colorTheme) {
        setColorTheme(themes[0].id);
      }
    }
    if (step < 4) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName,
          business_type: businessType,
          phone,
          color_theme: colorTheme,
          tagline,
          description,
          services,
          address,
          uploaded_images: uploadedImages,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to generate. Please try again.");
      }
      const data = await res.json();
      router.push(`/preview/${data.slug}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  };

  const updateService = (index: number, field: keyof ServiceItem, value: string) => {
    setServices((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const removeService = (index: number) => {
    setServices((prev) => prev.filter((_, i) => i !== index));
  };

  const addService = () => {
    setServices((prev) => [...prev, { name: "", price: "" }]);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <div className="mx-auto mb-8 h-16 w-16 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            Building your website...
          </h1>
          <p className="text-gray-600">
            Our AI is writing your content in English and Spanish
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <span className="text-lg font-bold text-gray-900">
            Site<span className="text-amber-600">ForOwners</span>
          </span>
          <span className="text-sm text-gray-500">Step {step} of 4</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-1 bg-amber-600 transition-all duration-300"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      <div className="mx-auto max-w-2xl px-6 py-10">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Business Basics */}
        {step === 1 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              About Your Business
            </h1>
            <p className="mb-8 text-gray-600">
              Let&apos;s start with the basics.
            </p>
            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Brooklyn Hair Studio"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  What type of business?
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.value}
                      onClick={() => setBusinessType(bt.value)}
                      className={`rounded-xl border-2 p-4 text-center transition-all ${
                        businessType === bt.value
                          ? "border-amber-600 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-2xl">{bt.emoji}</span>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {bt.label}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Your Phone Number{" "}
                  <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(718) 555-0123"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Tell us about your business{" "}
                  <span className="text-gray-400">(optional — helps us write better content)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Family-owned Dominican salon in Flatbush, been in the neighborhood for 12 years. We specialize in silk press, color treatments, and natural hair care. Our clients are like family."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                />
                <p className="mt-1 text-xs text-gray-400">
                  What makes your business special? How long have you been open? What do your customers love about you?
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Style */}
        {step === 2 && businessType && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Pick Your Style
            </h1>
            <p className="mb-8 text-gray-600">
              Choose a color theme for your website.
            </p>
            <div className="space-y-6">
              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700">
                  Color Theme
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {THEMES_BY_VERTICAL[businessType]?.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setColorTheme(theme.id)}
                      className={`rounded-xl border-2 p-4 transition-all ${
                        colorTheme === theme.id
                          ? "border-amber-600 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="mb-3 flex gap-1">
                        {theme.previewSwatch.map((color, i) => (
                          <div
                            key={i}
                            className="h-8 flex-1 rounded"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {theme.name}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-3 block text-sm font-medium text-gray-700">
                  Tagline
                </label>
                <div className="space-y-2">
                  {TAGLINES[businessType]?.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagline(t)}
                      className={`w-full rounded-lg border-2 px-4 py-3 text-left text-sm transition-all ${
                        tagline === t
                          ? "border-amber-600 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                  <input
                    type="text"
                    value={
                      TAGLINES[businessType]?.includes(tagline) ? "" : tagline
                    }
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Or write your own..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Services */}
        {step === 3 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Your Services
            </h1>
            <p className="mb-8 text-gray-600">
              We pre-filled some common services. Edit, add, or remove any.
            </p>
            <div className="space-y-3">
              {services.map((service, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={service.name}
                    onChange={(e) => updateService(i, "name", e.target.value)}
                    placeholder="Service name"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={service.price}
                    onChange={(e) => updateService(i, "price", e.target.value)}
                    placeholder="$0"
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={() => removeService(i)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                onClick={addService}
                className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-amber-500 hover:text-amber-600"
              >
                + Add a service
              </button>
            </div>
            <div className="mt-8">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Business Address{" "}
                <span className="text-gray-400">(optional — for map)</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 1430 Flatbush Ave, Brooklyn, NY 11210"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        )}

        {/* Step 4: Photos */}
        {step === 4 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Add Photos
            </h1>
            <p className="mb-8 text-gray-600">
              Upload photos of your business, or skip and we&apos;ll use
              professional stock photos.
            </p>

            {/* Uploaded images grid */}
            {uploadedImages.length > 0 && (
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {uploadedImages.map((url, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg">
                    <Image
                      src={url}
                      alt={`Upload ${i + 1}`}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload area */}
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-8 text-center transition-colors hover:border-amber-400 hover:bg-amber-50/30">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={uploading}
              />
              {uploading ? (
                <>
                  <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
                  <p className="text-sm font-medium text-gray-700">Uploading...</p>
                </>
              ) : (
                <>
                  <svg
                    className="mx-auto mb-3 h-10 w-10 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="mb-1 text-sm font-medium text-gray-700">
                    Tap to upload photos
                  </p>
                  <p className="text-xs text-gray-500">
                    JPG, PNG up to 5MB each &middot; Up to 10 photos
                  </p>
                </>
              )}
            </label>
            {uploadedImages.length === 0 && (
              <p className="mt-4 text-center text-xs text-gray-400">
                No photos? No problem — we&apos;ll use curated stock photos for your preview.
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          ) : (
            <div />
          )}
          {step < 4 ? (
            <Button
              onClick={handleNext}
              disabled={!canAdvance()}
              className="rounded-full bg-amber-600 px-8 text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={handleGenerate}
              className="rounded-full bg-amber-600 px-8 text-white hover:bg-amber-700"
            >
              Generate My Website
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

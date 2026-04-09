"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { DEFAULT_SERVICES } from "@/lib/templates/default-services";
import type { BusinessType, ServiceItem, ProductItem } from "@/lib/ai/types";
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

type Step = 1 | 2 | 3 | 4 | 5;
const TOTAL_STEPS = 5;

export default function PreviewWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Business basics
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  // Step 2: Services & address
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [address, setAddress] = useState("");
  const [tagline, setTagline] = useState("");

  // Step 3: Products & booking
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [hasProducts, setHasProducts] = useState(false);

  // Smart import
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [brandColors, setBrandColors] = useState<string[]>([]);

  // Step 4: Photos
  const [logo, setLogo] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Step 5: Review & generate

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

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError("");
    try {
      const res = await fetch("/api/import-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }
      const data = await res.json();
      if (data.business_name) setBusinessName(data.business_name);
      if (data.phone) setPhone(data.phone);
      if (data.address) setAddress(data.address);
      if (data.description) setDescription(data.description);
      if (data.booking_url) setBookingUrl(data.booking_url);
      if (data.services && data.services.length > 0) {
        setServices(
          data.services.map((s: { name: string; price: string }) => ({
            name: s.name,
            price: s.price || "",
          }))
        );
      }
      if (data.logo) {
        setLogo(data.logo);
      }
      if (data.brand_colors && data.brand_colors.length > 0) {
        setBrandColors(data.brand_colors);
      }
      if (data.images && data.images.length > 0) {
        const validImages = data.images.filter(
          (img: string) => img.startsWith("https://") && !img.endsWith(".svg")
        );
        if (validImages.length > 0) {
          setUploadedImages(validImages);
        }
      }
      setImported(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed. You can still fill in manually.");
    } finally {
      setImporting(false);
    }
  };

  const canAdvance = () => {
    switch (step) {
      case 1:
        return businessName.trim() && businessType;
      case 2:
        return services.some((s) => s.name.trim());
      case 3:
        return true; // products and booking are optional
      case 4:
        return true; // photos are optional
      case 5:
        return true;
    }
  };

  const initServicesForType = (type: BusinessType) => {
    setServices(DEFAULT_SERVICES[type] || []);
  };

  const handleNext = () => {
    if (step === 1 && businessType && !imported) {
      initServicesForType(businessType as BusinessType);
    }
    if (step < TOTAL_STEPS) {
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
          tagline,
          description,
          services,
          products: hasProducts ? products.filter((p) => p.name.trim()) : [],
          booking_url: bookingUrl || undefined,
          address,
          logo: logo || undefined,
          uploaded_images: uploadedImages,
          brand_colors: brandColors.length > 0 ? brandColors : undefined,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to generate. Please try again.");
      }
      const data = await res.json();
      router.push(`/preview/compare/${data.group_id}`);
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

  const updateProduct = (index: number, field: keyof ProductItem, value: string) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const addProduct = () => {
    setProducts((prev) => [...prev, { name: "", price: "" }]);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <div className="mx-auto mb-8 h-16 w-16 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            Building 3 website designs for you...
          </h1>
          <p className="text-gray-600">
            Our AI is writing your content in English and Spanish
          </p>
          <p className="mt-2 text-sm text-gray-400">
            This usually takes 15-30 seconds
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
          <span className="text-sm text-gray-500">Step {step} of {TOTAL_STEPS}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-1 bg-amber-600 transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
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

            {/* Smart Import */}
            {!imported && (
              <div className="mb-8 rounded-xl border-2 border-amber-200 bg-amber-50/50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <h3 className="text-sm font-semibold text-amber-900">Quick Import</h3>
                </div>
                <p className="mb-3 text-xs text-amber-800">
                  Have a Booksy, Acuity, Vagaro, or Square page? Paste the link and we&apos;ll pull in your services and info automatically.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="e.g. letstrylocs.as.me or booksy.com/..."
                    className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                    disabled={importing}
                  />
                  <Button
                    onClick={handleImport}
                    disabled={importing || !importUrl.trim()}
                    className="rounded-lg bg-amber-600 px-4 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {importing ? "Importing..." : "Import"}
                  </Button>
                </div>
              </div>
            )}

            {imported && (
              <div className="mb-8 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Imported successfully! Review and edit the details below.
              </div>
            )}
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

        {/* Step 2: Services & Tagline */}
        {step === 2 && (
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

            {businessType && (
              <div className="mt-8">
                <label className="mb-3 block text-sm font-medium text-gray-700">
                  Tagline <span className="text-gray-400">(optional)</span>
                </label>
                <div className="space-y-2">
                  {TAGLINES[businessType as BusinessType]?.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTagline(tagline === t ? "" : t)}
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
                      TAGLINES[businessType as BusinessType]?.includes(tagline) ? "" : tagline
                    }
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Or write your own..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Products & Booking */}
        {step === 3 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Products & Booking
            </h1>
            <p className="mb-8 text-gray-600">
              Optional — add products you sell and your booking link.
            </p>

            {/* Booking URL */}
            <div className="mb-8">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Online Booking Link{" "}
                <span className="text-gray-400">(Booksy, Vagaro, Square, Calendly, etc.)</span>
              </label>
              <input
                type="url"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder="e.g. https://booksy.com/en-us/your-business"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <p className="mt-1 text-xs text-gray-400">
                We&apos;ll add a &quot;Book Online&quot; button to your website. Supported platforms get embedded directly.
              </p>
            </div>

            {/* Products toggle */}
            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900">
                    Do you sell products?
                  </h3>
                  <p className="text-xs text-gray-500">
                    Hair products, accessories, merchandise, etc.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setHasProducts(!hasProducts);
                    if (!hasProducts && products.length === 0) {
                      setProducts([{ name: "", price: "" }]);
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    hasProducts ? "bg-amber-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      hasProducts ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {hasProducts && (
                <div className="mt-5 space-y-3">
                  {products.map((product, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={product.name}
                        onChange={(e) => updateProduct(i, "name", e.target.value)}
                        placeholder="Product name"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={product.price}
                        onChange={(e) => updateProduct(i, "price", e.target.value)}
                        placeholder="$0"
                        className="w-24 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
                      />
                      <button
                        onClick={() => removeProduct(i)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={addProduct}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-amber-500 hover:text-amber-600"
                  >
                    + Add a product
                  </button>
                </div>
              )}
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

        {/* Step 5: Review */}
        {step === 5 && (
          <div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">
              Ready to Build Your Website?
            </h1>
            <p className="mb-8 text-gray-600">
              We&apos;ll generate 3 unique website designs for you to choose from.
              Each will have different colors, styles, and copy — all personalized for {businessName || "your business"}.
            </p>

            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">Business</span>
                <span className="text-sm font-medium text-gray-900">{businessName}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">Type</span>
                <span className="text-sm font-medium text-gray-900">
                  {BUSINESS_TYPES.find((bt) => bt.value === businessType)?.label}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">Services</span>
                <span className="text-sm font-medium text-gray-900">
                  {services.filter((s) => s.name.trim()).length} services
                </span>
              </div>
              {hasProducts && products.filter((p) => p.name.trim()).length > 0 && (
                <div className="flex justify-between border-b border-gray-100 pb-3">
                  <span className="text-sm text-gray-500">Products</span>
                  <span className="text-sm font-medium text-gray-900">
                    {products.filter((p) => p.name.trim()).length} products
                  </span>
                </div>
              )}
              {bookingUrl && (
                <div className="flex justify-between border-b border-gray-100 pb-3">
                  <span className="text-sm text-gray-500">Booking</span>
                  <span className="text-sm font-medium text-green-600">Connected</span>
                </div>
              )}
              <div className="flex justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">Photos</span>
                <span className="text-sm font-medium text-gray-900">
                  {uploadedImages.length > 0
                    ? `${uploadedImages.length} uploaded`
                    : "Professional stock photos"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Languages</span>
                <span className="text-sm font-medium text-gray-900">English & Spanish</span>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-amber-50 p-4">
              <p className="text-center text-sm text-amber-800">
                You&apos;ll get <strong>3 unique designs</strong> to compare and choose from.
                Each one will look completely different — different colors, different vibe, same great content.
              </p>
            </div>
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
          {step < TOTAL_STEPS ? (
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
              Generate 2 Designs
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

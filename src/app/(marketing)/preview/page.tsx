"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { DEFAULT_SERVICES } from "@/lib/templates/default-services";
import type { BusinessType, ServiceItem, ProductItem } from "@/lib/ai/types";
import { useRouter, useSearchParams } from "next/navigation";

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

export default function PreviewWizardPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
      </main>
    }>
      <PreviewWizard />
    </Suspense>
  );
}

function PreviewWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editGroupId = searchParams.get("edit");
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(!!editGroupId);
  const [error, setError] = useState("");

  // Step 1: Business basics
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");

  // Step 2: Services
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [tagline, setTagline] = useState("");

  // Step 3: Products & booking
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [hasProducts, setHasProducts] = useState(false);

  // Smart import
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const importedRef = useRef(false);
  const [brandColors, setBrandColors] = useState<string[]>([]);
  const [bookingCategories, setBookingCategories] = useState<unknown[] | null>(null);

  // Step 4: Photos
  const [logo, setLogo] = useState<string>("");
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [hasHeroImage, setHasHeroImage] = useState<boolean>(true);
  const [uploading, setUploading] = useState(false);

  // Google Maps data
  const [mapsRating, setMapsRating] = useState<number | null>(null);
  const [mapsReviewCount, setMapsReviewCount] = useState<number | null>(null);
  const [mapsEnriched, setMapsEnriched] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const mapsLoadingRef = useRef(false);
  useEffect(() => { mapsLoadingRef.current = mapsLoading; }, [mapsLoading]);
  const [mapsReviews, setMapsReviews] = useState<{ authorName: string; rating: number; text: string; relativeTime: string }[]>([]);
  const [mapsHours, setMapsHours] = useState<Record<string, { open: string; close: string; closed?: boolean }> | null>(null);

  // Step 5: Template selection & generate
  const TEMPLATE_OPTIONS: { id: string; name: string; description: string }[] = [
    { id: "classic", name: "Classic", description: "Clean, professional layout with centered hero" },
    { id: "bold", name: "Bold", description: "Full-bleed hero image with large typography" },
    { id: "elegant", name: "Elegant", description: "Minimalist, refined with lots of whitespace" },
    { id: "vibrant", name: "Vibrant", description: "Colorful gradient hero, energetic feel" },
    { id: "warm", name: "Warm", description: "Split layout, friendly and inviting" },
  ];
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(["classic", "bold"]);
  const [keepColors, setKeepColors] = useState(false); // default OFF for new, ON for edit

  const toggleTemplate = (id: string) => {
    setSelectedTemplates((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // must keep at least 1
        return prev.filter((t) => t !== id);
      }
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  // Load existing preview data for editing
  useEffect(() => {
    if (!editGroupId) return;
    (async () => {
      try {
        // Support both ?edit=GROUP_ID and ?edit=SLUG
        const param = editGroupId.includes("-") ? `slug=${editGroupId}` : `group_id=${editGroupId}`;
        const res = await fetch(`/api/preview-data?${param}`);
        if (!res.ok) throw new Error("Failed to load");
        const d = await res.json();
        if (d.business_name) setBusinessName(d.business_name);
        if (d.business_type) setBusinessType(d.business_type);
        if (d.phone) setPhone(d.phone);
        if (d.address) setAddress(d.address);
        if (d.services?.length > 0) {
          setServices(d.services);
          setImported(true);
          importedRef.current = true;
        }
        if (d.products?.length > 0) {
          setProducts(d.products);
          setHasProducts(true);
        }
        if (d.booking_url) setBookingUrl(d.booking_url);
        if (d.images?.length > 0) setUploadedImages(d.images);
        if (d.logo) setLogo(d.logo);
        if (d.rating) setMapsRating(d.rating);
        if (d.review_count) setMapsReviewCount(d.review_count);
        if (d.google_reviews?.length > 0) setMapsReviews(d.google_reviews);
        if (d.hours) setMapsHours(d.hours);
        if (d.template_variant) setSelectedTemplates([d.template_variant]);
        if (d.brand_colors?.length > 0) setBrandColors(d.brand_colors);
        setKeepColors(true); // preserve colors by default when editing
        setMapsEnriched(true); // skip re-fetching maps
      } catch (e) {
        console.error("Failed to load edit data:", e);
      } finally {
        setEditLoading(false);
      }
    })();
  }, [editGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (data.booking_categories) setBookingCategories(data.booking_categories);
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
        setHasHeroImage(data.has_hero_image !== false);
      }
      setImported(true);
      importedRef.current = true;
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

  const enrichFromMaps = async () => {
    if (!businessName.trim() || !address.trim() || mapsEnriched || mapsLoading) return;
    setMapsLoading(true);
    try {
      const res = await fetch("/api/import-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
          address: address.trim(),
        }),
      });
      if (!res.ok) throw new Error("Maps lookup failed");
      const data = await res.json();
      if (data.rating) setMapsRating(data.rating);
      if (data.reviewCount) setMapsReviewCount(data.reviewCount);
      if (data.reviews && data.reviews.length > 0) setMapsReviews(data.reviews);
      if (data.phone && !phone) setPhone(data.phone);
      // Use Maps-generated services — prioritize over defaults, but not over booking imports
      if (data.services && data.services.length > 0 && !importedRef.current) {
        console.log(`Maps: applying ${data.services.length} generated services`);
        setServices(
          data.services.map((s: { name: string; price: string }) => ({
            name: s.name,
            price: s.price || "",
          }))
        );
      } else if (importedRef.current) {
        console.log("Maps: skipping services — booking import takes priority");
      }
      // Parse hours string: "Monday: 10:00 AM – 7:00 PM; Tuesday: ..."
      if (data.hours) {
        const parsed: Record<string, { open: string; close: string; closed?: boolean }> = {};
        const entries = (data.hours as string).split("; ");
        for (const entry of entries) {
          const colonIdx = entry.indexOf(": ");
          if (colonIdx === -1) continue;
          const day = entry.slice(0, colonIdx).trim();
          const timeRange = entry.slice(colonIdx + 2).trim();
          if (timeRange.toLowerCase() === "closed") {
            parsed[day] = { open: "", close: "", closed: true };
          } else {
            const parts = timeRange.split(/\s*[–-]\s*/);
            if (parts.length === 2) {
              parsed[day] = { open: parts[0].trim(), close: parts[1].trim() };
            }
          }
        }
        if (Object.keys(parsed).length > 0) setMapsHours(parsed);
      }
      // Merge Maps images — high-res Google CDN photos
      if (data.images && data.images.length > 0) {
        setUploadedImages((prev) => {
          const existing = new Set(prev);
          const newImages = data.images.filter((img: string) => !existing.has(img));
          if (newImages.length > 0) {
            setHasHeroImage(true); // Google CDN images are high-res
            // Put Maps images first if imported images were low-res (no hero)
            if (!hasHeroImage) {
              return [...newImages, ...prev];
            }
            return [...prev, ...newImages];
          }
          return prev;
        });
      }
      setMapsEnriched(true);
    } catch (e) {
      console.error("Maps enrichment failed:", e);
      // Non-blocking — wizard continues without Maps data
    } finally {
      setMapsLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      // Fire Maps enrichment when leaving step 1 — populates services, reviews, images
      if (address.trim() && businessName.trim() && !mapsEnriched) {
        enrichFromMaps();
      }
      if (businessType && !imported) {
        initServicesForType(businessType as BusinessType);
      }
    }
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  // Wait for Maps enrichment to complete before generating
  const waitForMaps = async (maxWait = 10000) => {
    if (!mapsLoading) return;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 300));
      // Check if mapsLoading has been set to false by re-reading via ref
      if (!mapsLoadingRef.current) return;
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    // Wait for Maps data if it's still loading
    await waitForMaps();

    const payload = {
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
      has_hero_image: hasHeroImage,
      brand_colors: brandColors.length > 0 ? brandColors : undefined,
      booking_categories: bookingCategories || undefined,
      rating: mapsRating || undefined,
      review_count: mapsReviewCount || undefined,
      google_reviews: mapsReviews.length > 0 ? mapsReviews : undefined,
      hours: mapsHours || undefined,
      templates: selectedTemplates,
      keep_colors: keepColors || undefined,
    };

    // Auto-retry up to 2 times on timeout/failure
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/generate-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          if (attempt < 2) { await new Promise((r) => setTimeout(r, 1000)); continue; }
          throw new Error("Failed to generate. Please try again.");
        }
        const data = await res.json();
        router.push(`/preview/compare/${data.group_id}`);
        return;
      } catch (e) {
        if (attempt < 2) { await new Promise((r) => setTimeout(r, 1000)); continue; }
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setLoading(false);
      }
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

  const handleProductImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("images", file);
    try {
      const res = await fetch("/api/upload-images", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      if (data.urls?.[0]) {
        setProducts((prev) =>
          prev.map((p, i) => (i === index ? { ...p, image: data.urls[0] } : p))
        );
      }
    } catch {
      setError("Failed to upload product image.");
    }
  };

  const removeProductImage = (index: number) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === index ? { ...p, image: undefined } : p))
    );
  };

  if (editLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <p className="text-gray-600">Loading your previous inputs...</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <div className="mx-auto mb-8 h-16 w-16 animate-spin rounded-full border-4 border-amber-200 border-t-amber-600" />
          <h1 className="mb-3 text-2xl font-bold text-gray-900">
            Building {selectedTemplates.length} website design{selectedTemplates.length > 1 ? "s" : ""} for you...
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
      {editGroupId && (
        <div className="border-b bg-amber-50 px-6 py-2.5">
          <p className="mx-auto max-w-2xl text-center text-sm text-amber-800">
            Edit mode — update any fields and regenerate
          </p>
        </div>
      )}

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
                  Business Address{" "}
                  <span className="text-gray-400">(helps us find reviews, photos & services)</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 1430 Flatbush Ave, Brooklyn, NY 11210"
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
                <div className="mt-5 space-y-4">
                  {products.map((product, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2">
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
                      {/* Description */}
                      <input
                        type="text"
                        value={product.description || ""}
                        onChange={(e) => updateProduct(i, "description", e.target.value)}
                        placeholder="Short description (optional)"
                        className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 focus:border-amber-500 focus:outline-none"
                      />
                      {/* Product image */}
                      <div className="mt-2 flex items-center gap-2">
                        {product.image ? (
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200">
                            <Image
                              src={product.image}
                              alt={product.name || "Product"}
                              fill
                              className="object-cover"
                              unoptimized
                            />
                            <button
                              onClick={() => removeProductImage(i)}
                              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:border-amber-400 hover:text-amber-600">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Add photo
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => handleProductImageUpload(i, e)}
                            />
                          </label>
                        )}
                      </div>
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
              <>
                <p className="mb-2 text-xs text-gray-400">Tap any image to set it as the hero background.</p>
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {uploadedImages.map((url, i) => (
                    <div
                      key={i}
                      className={`group relative aspect-square cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                        i === 0 ? "border-amber-500 ring-2 ring-amber-500/30" : "border-transparent hover:border-gray-300"
                      }`}
                      onClick={() => {
                        if (i === 0) return;
                        setUploadedImages((prev) => {
                          const updated = [...prev];
                          const [selected] = updated.splice(i, 1);
                          updated.unshift(selected);
                          return updated;
                        });
                      }}
                    >
                      <Image
                        src={url}
                        alt={`Upload ${i + 1}`}
                        fill
                        sizes="(max-width: 640px) 50vw, 33vw"
                        className="object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                          Hero
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </>
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
            {/* Maps enrichment status */}
            {mapsLoading && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                <p className="text-sm text-blue-700">Searching Google Maps for photos...</p>
              </div>
            )}
            {mapsEnriched && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800">
                  Found on Google Maps
                  {mapsRating ? ` — ${mapsRating}★` : ""}
                  {mapsReviewCount ? ` (${mapsReviewCount} reviews)` : ""}
                  {uploadedImages.length > 0 ? ` · ${uploadedImages.length} photos` : ""}
                </p>
              </div>
            )}
            {uploadedImages.length === 0 && !mapsLoading && (
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
              Choose Your Design Styles
            </h1>
            <p className="mb-8 text-gray-600">
              Pick 1–3 templates. We&apos;ll generate each with unique colors and copy for {businessName || "your business"}.
            </p>

            {/* Template picker */}
            <div className="mb-8 space-y-3">
              {TEMPLATE_OPTIONS.map((tmpl) => {
                const selected = selectedTemplates.includes(tmpl.id);
                return (
                  <button
                    key={tmpl.id}
                    onClick={() => toggleTemplate(tmpl.id)}
                    className={`flex w-full items-center gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                      selected
                        ? "border-amber-600 bg-amber-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                        selected
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-gray-300"
                      }`}
                    >
                      {selected && (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{tmpl.name}</p>
                      <p className="text-xs text-gray-500">{tmpl.description}</p>
                    </div>
                  </button>
                );
              })}
              <p className="text-center text-xs text-gray-400">
                {selectedTemplates.length}/3 selected
              </p>
            </div>

            {/* Color Theme Section */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Color Theme</h3>
                {editGroupId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Keep colors</span>
                    <button
                      onClick={() => setKeepColors(!keepColors)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        keepColors ? "bg-amber-600" : "bg-gray-300"
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        keepColors ? "translate-x-[18px]" : "translate-x-0.5"
                      }`} />
                    </button>
                  </div>
                )}
              </div>

              {/* Color preview + edit */}
              {brandColors.length > 0 ? (
                <div>
                  <p className="mb-3 text-xs text-gray-500">
                    {editGroupId && keepColors ? "These colors will be preserved:" : "Imported from your booking app — edit to customize:"}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {brandColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <label className="relative cursor-pointer">
                          <div
                            className="h-10 w-10 rounded-lg border-2 border-gray-200 shadow-sm transition-transform hover:scale-110"
                            style={{ backgroundColor: color }}
                          />
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const updated = [...brandColors];
                              updated[i] = e.target.value;
                              setBrandColors(updated);
                              if (keepColors) setKeepColors(false);
                            }}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                        </label>
                        <span className="text-xs text-gray-400">{i === 0 ? "Primary" : i === 1 ? "Secondary" : "Accent"}</span>
                      </div>
                    ))}
                  </div>
                  {/* Mini preview of how colors look */}
                  <div className="mt-4 flex items-stretch overflow-hidden rounded-lg border" style={{ height: 48 }}>
                    <div className="flex-1" style={{ backgroundColor: brandColors[0] || "#E91E8B" }} />
                    <div className="flex-1" style={{ backgroundColor: brandColors[1] || brandColors[0] || "#E91E8B", opacity: 0.7 }} />
                    <div className="flex-1" style={{ backgroundColor: brandColors[2] || brandColors[0] || "#E91E8B", opacity: 0.4 }} />
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-xs text-gray-500">No brand colors imported. Add a custom color or let us pick automatically.</p>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-2.5 text-xs text-gray-500 hover:border-amber-400 hover:text-amber-600">
                      <div className="h-6 w-6 rounded border bg-gradient-to-br from-pink-400 to-purple-500" />
                      Pick a brand color
                      <input
                        type="color"
                        defaultValue="#E91E8B"
                        onChange={(e) => setBrandColors([e.target.value])}
                        className="absolute opacity-0"
                        style={{ width: 0, height: 0 }}
                      />
                    </label>
                    {brandColors.length === 0 && (
                      <span className="text-xs text-gray-400">or we&apos;ll use a theme that fits your business type</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
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
              {mapsRating && (
                <div className="flex justify-between border-b border-gray-100 pb-3">
                  <span className="text-sm text-gray-500">Google Rating</span>
                  <span className="text-sm font-medium text-gray-900">
                    {mapsRating}★{mapsReviewCount ? ` (${mapsReviewCount} reviews)` : ""}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Languages</span>
                <span className="text-sm font-medium text-gray-900">English & Spanish</span>
              </div>
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
              Generate {selectedTemplates.length} Design{selectedTemplates.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

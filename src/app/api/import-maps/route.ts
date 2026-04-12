import { NextResponse } from "next/server";

interface PlaceReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

interface PlaceResult {
  name: string | null;
  category: string | null;
  rating: number | null;
  reviewCount: number | null;
  phone: string | null;
  address: string | null;
  hours: string | null;
  images: string[];
  website: string | null;
  reviews: PlaceReview[];
}

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

/**
 * Check if the returned place name matches the searched business name.
 * Uses word overlap — at least 50% of significant words must match,
 * OR one name fully contains the other.
 */
function isNameMatch(searched: string, returned: string): boolean {
  // Direct containment: "Brooklyn Hair Studio" matches "Brooklyn Hair Studio & Spa"
  if (returned.includes(searched) || searched.includes(returned)) {
    return true;
  }

  // Word overlap: strip common filler words, compare significant words
  const filler = new Set(["the", "of", "and", "&", "a", "an", "at", "in", "on", "by", "llc", "inc", "corp"]);
  const toWords = (s: string) =>
    s.replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 1 && !filler.has(w));

  const searchedWords = toWords(searched);
  const returnedWords = toWords(returned);

  if (searchedWords.length === 0 || returnedWords.length === 0) return false;

  const returnedSet = new Set(returnedWords);
  const matchCount = searchedWords.filter((w) => returnedSet.has(w)).length;
  const matchRatio = matchCount / searchedWords.length;

  return matchRatio >= 0.5;
}

/**
 * Find a business on Google Maps using the Places API (New).
 * Uses Text Search to find by name + address, then fetches details + photos.
 */
async function findBusinessOnMaps(
  businessName: string,
  address: string
): Promise<PlaceResult> {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  // Step 1: Text Search to find the place
  const searchRes = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.currentOpeningHours,places.photos,places.reviews",
      },
      body: JSON.stringify({
        textQuery: `${businessName} ${address}`,
        maxResultCount: 1,
      }),
    }
  );

  if (!searchRes.ok) {
    const err = await searchRes.text();
    console.error("Places search error:", err);
    throw new Error("Places API search failed");
  }

  const searchData = await searchRes.json();
  const place = searchData.places?.[0];

  const emptyResult: PlaceResult = {
    name: null,
    category: null,
    rating: null,
    reviewCount: null,
    phone: null,
    address: null,
    hours: null,
    images: [],
    website: null,
    reviews: [],
  };

  if (!place) {
    return emptyResult;
  }

  // Validate that the result matches the searched business name.
  // Shared addresses (strip malls, buildings) can return a different business.
  const returnedName = (place.displayName?.text || "").toLowerCase();
  const searchedName = businessName.toLowerCase();
  if (!isNameMatch(searchedName, returnedName)) {
    console.log(
      `Maps name mismatch: searched "${businessName}", got "${place.displayName?.text}". Skipping.`
    );
    return emptyResult;
  }

  // Step 2: Fetch photo URLs (up to 10)
  const images: string[] = [];
  const photos = place.photos?.slice(0, 10) || [];
  for (const photo of photos) {
    const photoName = photo.name; // e.g. "places/PLACE_ID/photos/PHOTO_REF"
    if (photoName) {
      // Places API (New) photo URL format
      images.push(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&key=${GOOGLE_API_KEY}`
      );
    }
  }

  // Parse hours into a readable string
  let hours: string | null = null;
  if (place.currentOpeningHours?.weekdayDescriptions) {
    hours = place.currentOpeningHours.weekdayDescriptions.join("; ");
  }

  // Step 3: Extract top reviews (4+ stars, sorted by rating)
  // Places API (New) review shape:
  //   authorDisplayName: { text: string }, rating: number,
  //   text: { text: string }, relativePublishTimeDescription: string
  const rawReviews = place.reviews || [];
  console.log(`Maps: found ${rawReviews.length} reviews for "${place.displayName?.text}"`);

  const reviews: PlaceReview[] = rawReviews
    .filter((r: { rating?: number; text?: { text?: string }; originalText?: { text?: string } }) =>
      (r.rating || 0) >= 4 && (r.text?.text || r.originalText?.text)
    )
    .sort((a: { rating?: number }, b: { rating?: number }) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3)
    .map((r: {
      authorDisplayName?: { text?: string } | string;
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      relativePublishTimeDescription?: string;
    }) => ({
      authorName:
        (typeof r.authorDisplayName === "object"
          ? r.authorDisplayName?.text
          : r.authorDisplayName) || "Customer",
      rating: r.rating || 5,
      text: r.text?.text || r.originalText?.text || "",
      relativeTime: r.relativePublishTimeDescription || "",
    }));

  return {
    name: place.displayName?.text || null,
    category: place.primaryType || null,
    rating: place.rating || null,
    reviewCount: place.userRatingCount || null,
    phone: place.nationalPhoneNumber || null,
    address: place.formattedAddress || null,
    hours,
    images,
    website: place.websiteUri || null,
    reviews,
  };
}

export async function POST(request: Request) {
  try {
    const { business_name, address } = await request.json();

    if (!business_name || !address) {
      return NextResponse.json(
        { error: "Both business_name and address are required" },
        { status: 400 }
      );
    }

    const data = await findBusinessOnMaps(business_name, address);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Google Maps lookup error:", error);
    return NextResponse.json(
      { error: "Failed to fetch business data from Google Maps." },
      { status: 500 }
    );
  }
}

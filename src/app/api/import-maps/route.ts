import { NextResponse } from "next/server";

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
}

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

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
          "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.primaryType,places.currentOpeningHours,places.photos",
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

  if (!place) {
    return {
      name: null,
      category: null,
      rating: null,
      reviewCount: null,
      phone: null,
      address: null,
      hours: null,
      images: [],
      website: null,
    };
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

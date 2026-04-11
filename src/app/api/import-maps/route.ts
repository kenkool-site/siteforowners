import { NextResponse } from "next/server";

interface MapsBusinessData {
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

/**
 * Scrape Google Maps for business details using Playwright.
 * Searches by business name + address to find the exact location.
 */
async function scrapeGoogleMaps(
  businessName: string,
  address: string
): Promise<MapsBusinessData> {
  // Dynamic import — Playwright is a dev dependency, won't be in production
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  try {
    const page = await context.newPage();

    // Intercept image requests to capture all loaded photos
    const imageUrls = new Set<string>();
    page.on("response", (res) => {
      const url = res.url();
      if (
        url.includes("googleusercontent.com") &&
        (url.includes("gps-cs") || url.includes("lh3")) &&
        !url.includes("avatar") &&
        !url.includes("=s32") &&
        !url.includes("=s44")
      ) {
        imageUrls.add(url);
      }
    });

    // Search Google Maps by name + address
    const query = `${businessName} ${address}`;
    await page.goto(
      `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );
    await page.waitForTimeout(6000);

    // Click the first search result to open detail panel
    const firstResult = await page.$(
      '[role="feed"] > div:first-child a[aria-label]'
    );
    if (firstResult) {
      await firstResult.click();
      await page.waitForTimeout(4000);
    }

    // Scroll down to trigger lazy-loaded content
    await page.evaluate(() => {
      const panel = document.querySelector('[role="main"]');
      if (panel) panel.scrollTop = 1000;
    });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const panel = document.querySelector('[role="main"]');
      if (panel) panel.scrollTop = 2000;
    });
    await page.waitForTimeout(1500);

    // Try opening the photos tab for more images
    const seePhotos = await page.$('button:has-text("See photos")');
    if (seePhotos) {
      await seePhotos.click();
      await page.waitForTimeout(3000);
      // Scroll the photo grid
      await page.evaluate(() => {
        const panel = document.querySelector('[role="main"]');
        if (panel) panel.scrollTop = 2000;
      });
      await page.waitForTimeout(2000);

      // Go back to detail view
      await page.goBack();
      await page.waitForTimeout(3000);
    }

    // Extract structured data from the page
    const data = await page.evaluate(() => {
      const result: Record<string, unknown> = {};

      // Business name from h1
      const h1 = document.querySelector("h1");
      result.name = h1?.textContent?.trim() || null;

      // Category (e.g., "Hair salon")
      const categoryEl = document.querySelector(
        'button[jsaction*="category"]'
      );
      result.category = categoryEl?.textContent?.trim() || null;

      // Rating and review count from body text
      const allText = document.body.innerText;
      const ratingMatch = allText.match(
        /([\d.]+)\s*(?:stars?)?\s*\n?\s*\(?([\d,]+)\)?\s*(?:reviews?|avis)/i
      );
      if (ratingMatch) {
        result.rating = parseFloat(ratingMatch[1]);
        result.reviewCount = parseInt(ratingMatch[2].replace(/,/g, ""), 10);
      } else {
        // Fallback: get rating from stars label
        const starsEl = document.querySelector(
          '[role="img"][aria-label*="star"]'
        );
        if (starsEl) {
          const label = starsEl.getAttribute("aria-label") || "";
          const m = label.match(/([\d.]+)/);
          if (m) result.rating = parseFloat(m[1]);
        }
        // Fallback: review count from buttons
        const buttons = Array.from(document.querySelectorAll("button"));
        for (const btn of buttons) {
          const t = btn.textContent?.trim() || "";
          const m = t.match(/([\d,]+)\s*reviews?/i);
          if (m) {
            result.reviewCount = parseInt(m[1].replace(/,/g, ""), 10);
            break;
          }
        }
      }

      // Address and phone from data-item-id elements
      document.querySelectorAll("[data-item-id]").forEach((el) => {
        const id = el.getAttribute("data-item-id");
        const text = el.textContent?.trim();
        if (id === "address" || id === "laddress")
          result.address = result.address || text;
        if (id === "phone" || id === "lphone")
          result.phone = result.phone || text;
        if (id === "authority") result.website = text;
        if (id?.startsWith("oh")) result.hours = result.hours || text;
      });

      // Fallback: aria-labels for address/phone
      if (!result.address || !result.phone) {
        document.querySelectorAll("[aria-label]").forEach((el) => {
          const label = el.getAttribute("aria-label") || "";
          if (!result.address && label.startsWith("Address:")) {
            result.address = label.replace("Address:", "").trim();
          }
          if (!result.phone && label.startsWith("Phone:")) {
            result.phone = label.replace("Phone:", "").trim();
          }
        });
      }

      // Images from DOM
      result.images = Array.from(document.querySelectorAll("img"))
        .filter(
          (img) =>
            img.src?.includes("googleusercontent") &&
            img.naturalWidth > 50 &&
            !img.src.includes("avatar") &&
            !img.src.includes("profile")
        )
        .map((img) => {
          let src = img.src;
          src = src.replace(/=w\d+[^&]*/, "=w1200");
          src = src.replace(/=s\d+[^&]*/, "=s1200");
          return src;
        })
        .filter((v, i, a) => a.indexOf(v) === i);

      return result;
    });

    // Combine DOM images with intercepted network images
    const intercepted = Array.from(imageUrls).map((u) =>
      u.replace(/=w\d+[^&]*/, "=w1200").replace(/=s\d+[^&]*/, "=s1200")
    );
    const allImages = Array.from(
      new Set([
        ...((data.images as string[]) || []),
        ...intercepted,
      ])
    ).slice(0, 10);

    return {
      name: (data.name as string) || null,
      category: (data.category as string) || null,
      rating: (data.rating as number) || null,
      reviewCount: (data.reviewCount as number) || null,
      phone: (data.phone as string) || null,
      address: (data.address as string) || null,
      hours: (data.hours as string) || null,
      images: allImages,
      website: (data.website as string) || null,
    };
  } finally {
    await browser.close();
  }
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

    const data = await scrapeGoogleMaps(business_name, address);

    return NextResponse.json(data);
  } catch (error) {
    console.error("Google Maps scrape error:", error);
    return NextResponse.json(
      { error: "Failed to fetch business data from Google Maps." },
      { status: 500 }
    );
  }
}

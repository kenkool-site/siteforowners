export type BusinessType = 'salon' | 'barbershop' | 'restaurant' | 'nails' | 'braids';

export type ColorTheme =
  // Salon
  | 'salon_gold' | 'salon_rose' | 'salon_mocha' | 'salon_lavender' | 'salon_midnight'
  | 'salon_emerald' | 'salon_peach' | 'salon_noir'
  // Barbershop
  | 'barbershop_black_gold' | 'barbershop_navy' | 'barbershop_forest' | 'barbershop_burgundy' | 'barbershop_charcoal'
  | 'barbershop_slate' | 'barbershop_vintage' | 'barbershop_ice'
  // Restaurant
  | 'restaurant_burgundy' | 'restaurant_olive' | 'restaurant_ocean' | 'restaurant_terracotta' | 'restaurant_midnight'
  | 'restaurant_sage' | 'restaurant_fire' | 'restaurant_noir'
  // Nails
  | 'nails_pink' | 'nails_coral' | 'nails_berry' | 'nails_rose_gold' | 'nails_midnight'
  | 'nails_seafoam' | 'nails_lilac' | 'nails_champagne'
  // Braids
  | 'braids_kente' | 'braids_royal' | 'braids_earth' | 'braids_ocean' | 'braids_sunset'
  | 'braids_midnight' | 'braids_coral' | 'braids_jade';

export type TemplateName = 'classic' | 'bold' | 'elegant' | 'vibrant' | 'warm';

/**
 * Customer-selectable extra applied to a single service. Persisted in
 * previews.services[].add_ons. Multiple of 30 minutes; non-negative price.
 */
export interface AddOn {
  name: string;                    // ≤ 80 chars (server truncates)
  price_delta: number;             // ≥ 0, max 2 decimals
  duration_delta_minutes: number;  // ≥ 0, multiple of 30
}

export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
  /** v2 (Spec 1) — multiples of 30, range [30, 480]. */
  duration_minutes?: number;
  /** v3 (Spec 3) — public URL of the uploaded service image. */
  image?: string;
  /** v4 (Spec 4) — stable client-side ID; preserved across renames. */
  client_id?: string;
  /** v4 (Spec 4) — must match one of previews.categories if set. */
  category?: string;
  /** v4 (Spec 4) — optional extras the customer can add at booking time. */
  add_ons?: AddOn[];
}

export interface ProductItem {
  name: string;
  price: string;
  description?: string;
  image?: string;
}

export interface BusinessHours {
  [day: string]: { open: string; close: string; closed?: boolean };
}

export interface GeneratedCopy {
  en: {
    hero_headline: string;
    hero_subheadline: string;
    about_paragraphs: string[];
    service_descriptions: Record<string, string>;
    seo_title: string;
    seo_description: string;
    footer_tagline: string;
    google_business_description: string;
    booking_intro?: string;
  };
  es: {
    hero_headline: string;
    hero_subheadline: string;
    about_paragraphs: string[];
    service_descriptions: Record<string, string>;
    seo_title: string;
    seo_description: string;
    footer_tagline: string;
    google_business_description: string;
    booking_intro?: string;
  };
}

export interface PreviewData {
  id?: string;
  slug?: string;
  business_name: string;
  business_type: BusinessType;
  phone?: string;
  color_theme: ColorTheme;
  services: ServiceItem[];
  categories?: string[];
  products?: ProductItem[];
  booking_url?: string;
  hours?: BusinessHours;
  imported_hours?: BusinessHours;
  address?: string;
  images?: string[];
  hero_video_url?: string | null;
  rating?: number;
  review_count?: number;
  generated_copy?: GeneratedCopy;
  template_variant?: string;
  group_id?: string; // links preview variants together
  variant_label?: string; // "A", "B"
  is_selected?: boolean; // user's chosen variant
}

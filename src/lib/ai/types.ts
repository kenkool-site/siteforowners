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

export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
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
  products?: ProductItem[];
  booking_url?: string;
  hours?: BusinessHours;
  address?: string;
  images?: string[];
  generated_copy?: GeneratedCopy;
  template_variant?: string;
  group_id?: string; // links preview variants together
  variant_label?: string; // "A", "B"
  is_selected?: boolean; // user's chosen variant
}

export type BusinessType = 'salon' | 'barbershop' | 'restaurant' | 'nails' | 'braids';

export type ColorTheme =
  // Salon
  | 'salon_gold' | 'salon_rose' | 'salon_mocha'
  // Barbershop
  | 'barbershop_black_gold' | 'barbershop_navy' | 'barbershop_forest'
  // Restaurant
  | 'restaurant_burgundy' | 'restaurant_olive' | 'restaurant_ocean'
  // Nails
  | 'nails_pink' | 'nails_coral' | 'nails_berry'
  // Braids
  | 'braids_kente' | 'braids_royal' | 'braids_earth';

export interface ServiceItem {
  name: string;
  price: string;
  description?: string;
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
  hours?: BusinessHours;
  address?: string;
  images?: string[];
  generated_copy?: GeneratedCopy;
  template_variant?: string;
}

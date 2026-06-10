import type { BusinessType, ServiceItem } from '@/lib/ai/types';
import { serviceDefaultImage } from '@/lib/templates/service-images';

// Default fallback service cards, shown when a tenant has no real images
// (no Google Maps photos, no booking-app images, no uploads). Each card's image
// is a self-hosted file at public/defaults/services/<type>/<slug>.jpg, named
// after the service (see service-images.ts). Swap a photo by overwriting its
// file; add a service by adding a {name, price} below and dropping its file.

type DefaultService = Pick<ServiceItem, 'name' | 'price'>;

const withImages = (type: BusinessType, items: DefaultService[]): ServiceItem[] =>
  items.map((it) => ({ ...it, image: serviceDefaultImage(type, it.name) }));

const BASE_SERVICES = {
  salon: withImages('salon', [
    { name: 'Wash & Blowout', price: '$45' },
    { name: 'Haircut & Style', price: '$65' },
    { name: 'Color Treatment', price: '$120' },
    { name: 'Deep Conditioning', price: '$35' },
    { name: 'Silk Press', price: '$85' },
    { name: 'Keratin Treatment', price: '$200' },
  ]),
  barbershop: withImages('barbershop', [
    { name: 'Classic Haircut', price: '$25' },
    { name: 'Haircut & Beard Trim', price: '$35' },
    { name: 'Beard Shape-Up', price: '$15' },
    { name: 'Hot Towel Shave', price: '$30' },
    { name: 'Kids Haircut', price: '$18' },
    { name: 'Line-Up / Edge-Up', price: '$15' },
  ]),
  restaurant: withImages('restaurant', [
    { name: 'Appetizers', price: 'from $8' },
    { name: 'Main Courses', price: 'from $15' },
    { name: 'Daily Specials', price: '$12' },
    { name: 'Desserts', price: 'from $7' },
    { name: 'Beverages', price: 'from $3' },
    { name: 'Catering', price: 'Call for pricing' },
  ]),
  nails: withImages('nails', [
    { name: 'Classic Manicure', price: '$25' },
    { name: 'Gel Manicure', price: '$40' },
    { name: 'Classic Pedicure', price: '$35' },
    { name: 'Acrylic Full Set', price: '$55' },
    { name: 'Nail Art (per nail)', price: '$5' },
    { name: 'Gel Removal', price: '$15' },
  ]),
  braids: withImages('braids', [
    { name: 'Medium Knotless Braids', price: '$180+' },
    { name: 'Boho Knotless Braids', price: '$220+' },
    { name: 'Medium Box Braids', price: '$160+' },
    { name: 'Cornrows / Feed-In Braids', price: '$90+' },
    { name: 'Stitch Braids', price: '$120+' },
    { name: 'Crochet Braids', price: '$140+' },
    { name: 'Fulani Braids', price: '$180+' },
    { name: 'Lemonade Braids', price: '$150+' },
    { name: 'Kids Braids', price: '$110+' },
    { name: "Men's Braids / Cornrows", price: '$70+' },
  ]),
  locs: withImages('locs', [
    { name: 'Loc Consultation', price: '$25' },
    { name: 'Wash & Retwist', price: '$120+' },
    { name: 'Retwist & Style', price: '$150+' },
    { name: 'Starter Locs', price: '$250+' },
    { name: 'Two-Strand Twist Loc Style', price: '$35+' },
    { name: 'Interlocking Maintenance', price: '$180+' },
    { name: 'Instant Locs', price: '$350+' },
    { name: 'Loc Repair', price: '$25 per loc' },
    { name: 'Faux Locs', price: '$220+' },
    { name: 'Microloc Retie', price: '$225+' },
  ]),
} satisfies Record<Exclude<BusinessType, "locs_and_braids">, ServiceItem[]>;

/**
 * The local default service photos for a business type, deduped — used to seed
 * the default gallery (and hero) when a tenant has no real images. Owned, local
 * files rather than remote stock; see generate-copy where stock is appended for
 * extra variety.
 */
export function defaultGalleryImages(type: BusinessType): string[] {
  return Array.from(new Set((DEFAULT_SERVICES[type] ?? []).map((s) => s.image!)));
}

export const DEFAULT_SERVICES: Record<BusinessType, ServiceItem[]> = {
  ...BASE_SERVICES,
  // Combined "Locs & Braids" — a tight, curated mix of the most-requested
  // services from both verticals (4 braids + 4 locs), reusing their images.
  locs_and_braids: [
    BASE_SERVICES.braids[0], // Medium Knotless Braids
    BASE_SERVICES.braids[2], // Medium Box Braids
    BASE_SERVICES.braids[3], // Cornrows / Feed-In Braids
    BASE_SERVICES.braids[8], // Kids Braids
    BASE_SERVICES.locs[0],   // Loc Consultation
    BASE_SERVICES.locs[3],   // Starter Locs
    BASE_SERVICES.locs[1],   // Wash & Retwist
    BASE_SERVICES.locs[2],   // Retwist & Style
  ],
};

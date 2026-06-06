import type { BusinessType, ServiceItem } from '@/lib/ai/types';
import { STOCK_PHOTOS } from '@/lib/templates/stock-photos';

function serviceImage(type: BusinessType, index: number): string {
  const images = STOCK_PHOTOS[type] || STOCK_PHOTOS.salon;
  return images[index % images.length];
}

export const DEFAULT_SERVICES: Record<BusinessType, ServiceItem[]> = {
  salon: [
    { name: 'Wash & Blowout', price: '$45', image: serviceImage('salon', 0) },
    { name: 'Haircut & Style', price: '$65', image: serviceImage('salon', 1) },
    { name: 'Color Treatment', price: '$120', image: serviceImage('salon', 2) },
    { name: 'Deep Conditioning', price: '$35', image: serviceImage('salon', 3) },
    { name: 'Silk Press', price: '$85', image: serviceImage('salon', 4) },
    { name: 'Keratin Treatment', price: '$200', image: serviceImage('salon', 5) },
  ],
  barbershop: [
    { name: 'Classic Haircut', price: '$25', image: serviceImage('barbershop', 0) },
    { name: 'Haircut & Beard Trim', price: '$35', image: serviceImage('barbershop', 1) },
    { name: 'Beard Shape-Up', price: '$15', image: serviceImage('barbershop', 2) },
    { name: 'Hot Towel Shave', price: '$30', image: serviceImage('barbershop', 3) },
    { name: 'Kids Haircut', price: '$18', image: serviceImage('barbershop', 4) },
    { name: 'Line-Up / Edge-Up', price: '$15', image: serviceImage('barbershop', 5) },
  ],
  restaurant: [
    { name: 'Appetizers', price: 'from $8', image: serviceImage('restaurant', 0) },
    { name: 'Main Courses', price: 'from $15', image: serviceImage('restaurant', 1) },
    { name: 'Daily Specials', price: '$12', image: serviceImage('restaurant', 2) },
    { name: 'Desserts', price: 'from $7', image: serviceImage('restaurant', 3) },
    { name: 'Beverages', price: 'from $3', image: serviceImage('restaurant', 4) },
    { name: 'Catering', price: 'Call for pricing', image: serviceImage('restaurant', 5) },
  ],
  nails: [
    { name: 'Classic Manicure', price: '$25', image: serviceImage('nails', 0) },
    { name: 'Gel Manicure', price: '$40', image: serviceImage('nails', 1) },
    { name: 'Classic Pedicure', price: '$35', image: serviceImage('nails', 2) },
    { name: 'Acrylic Full Set', price: '$55', image: serviceImage('nails', 3) },
    { name: 'Nail Art (per nail)', price: '$5', image: serviceImage('nails', 4) },
    { name: 'Gel Removal', price: '$15', image: serviceImage('nails', 5) },
  ],
  braids: [
    { name: 'Medium Knotless Braids', price: '$180+', image: serviceImage('braids', 0) },
    { name: 'Boho Knotless Braids', price: '$220+', image: serviceImage('braids', 1) },
    { name: 'Medium Box Braids', price: '$160+', image: serviceImage('braids', 2) },
    { name: 'Cornrows / Feed-In Braids', price: '$90+', image: serviceImage('braids', 3) },
    { name: 'Stitch Braids', price: '$120+', image: serviceImage('braids', 4) },
    { name: 'Crochet Braids', price: '$140+', image: serviceImage('braids', 5) },
    { name: 'Fulani Braids', price: '$180+', image: serviceImage('braids', 6) },
    { name: 'Lemonade Braids', price: '$150+', image: serviceImage('braids', 7) },
    { name: 'Kids Braids', price: '$110+', image: serviceImage('braids', 8) },
    { name: "Men's Braids / Cornrows", price: '$70+', image: serviceImage('braids', 9) },
  ],
  locs: [
    { name: 'Loc Consultation', price: '$25', image: serviceImage('locs', 0) },
    { name: 'Wash & Retwist', price: '$120+', image: serviceImage('locs', 1) },
    { name: 'Retwist & Style', price: '$150+', image: serviceImage('locs', 2) },
    { name: 'Starter Locs', price: '$250+', image: serviceImage('locs', 3) },
    { name: 'Two-Strand Twist Loc Style', price: '$35+', image: serviceImage('locs', 4) },
    { name: 'Interlocking Maintenance', price: '$180+', image: serviceImage('locs', 5) },
    { name: 'Instant Locs', price: '$350+', image: serviceImage('locs', 6) },
    { name: 'Loc Repair', price: '$25 per loc', image: serviceImage('locs', 7) },
    { name: 'Faux Locs', price: '$220+', image: serviceImage('locs', 8) },
    { name: 'Microloc Retie', price: '$225+', image: serviceImage('locs', 9) },
  ],
};

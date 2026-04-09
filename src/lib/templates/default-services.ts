import type { BusinessType, ServiceItem } from '@/lib/ai/types';

export const DEFAULT_SERVICES: Record<BusinessType, ServiceItem[]> = {
  salon: [
    { name: 'Wash & Blowout', price: '$45' },
    { name: 'Haircut & Style', price: '$65' },
    { name: 'Color Treatment', price: '$120' },
    { name: 'Deep Conditioning', price: '$35' },
    { name: 'Silk Press', price: '$85' },
    { name: 'Keratin Treatment', price: '$200' },
  ],
  barbershop: [
    { name: 'Classic Haircut', price: '$25' },
    { name: 'Haircut & Beard Trim', price: '$35' },
    { name: 'Beard Shape-Up', price: '$15' },
    { name: 'Hot Towel Shave', price: '$30' },
    { name: 'Kids Haircut', price: '$18' },
    { name: 'Line-Up / Edge-Up', price: '$15' },
  ],
  restaurant: [
    { name: 'Appetizers', price: 'from $8' },
    { name: 'Main Courses', price: 'from $15' },
    { name: 'Daily Specials', price: '$12' },
    { name: 'Desserts', price: 'from $7' },
    { name: 'Beverages', price: 'from $3' },
    { name: 'Catering', price: 'Call for pricing' },
  ],
  nails: [
    { name: 'Classic Manicure', price: '$25' },
    { name: 'Gel Manicure', price: '$40' },
    { name: 'Classic Pedicure', price: '$35' },
    { name: 'Acrylic Full Set', price: '$55' },
    { name: 'Nail Art (per nail)', price: '$5' },
    { name: 'Gel Removal', price: '$15' },
  ],
  braids: [
    { name: 'Box Braids', price: '$150' },
    { name: 'Cornrows', price: '$80' },
    { name: 'Knotless Braids', price: '$200' },
    { name: 'Locs / Dreadlocks', price: '$250' },
    { name: 'Twist Outs', price: '$100' },
    { name: 'Crochet Braids', price: '$120' },
  ],
};

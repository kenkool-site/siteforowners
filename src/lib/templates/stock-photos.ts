import type { BusinessType } from "@/lib/ai/types";

// All images from Pexels (free for commercial use, no attribution required)
// Curated per vertical — verified accessible as of 2026-04-11

const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;

export const STOCK_PHOTOS: Record<BusinessType, string[]> = {
  salon: [
    pexels(8834026),  // Woman standing near round mirrors of a salon
    pexels(8834071),  // Woman cutting hair of client
    pexels(3993468),  // Woman in salon chair
    pexels(14564860), // Salon interior
    pexels(3736396),  // Salon styling station
    pexels(3993293),  // Salon setup
  ],
  barbershop: [
    pexels(34865582), // Vintage barbershop interior with empty chairs
    pexels(30668154), // Barbershop interior
    pexels(2174113),  // Man sitting in barber chair
    pexels(7697351),  // Barber at work
    pexels(18704464), // Barbershop tools
    pexels(1860567),  // Barber cutting hair
  ],
  restaurant: [
    pexels(15945660), // Restaurant interior
    pexels(36183154), // Elegant dining table in cozy restaurant
    pexels(14064612), // Round table inside a restaurant
    pexels(10445929), // Wine glasses on table
    pexels(28999499), // Restaurant dining scene
    pexels(239975),   // Restaurant plate setting
  ],
  nails: [
    pexels(34871553), // Elegant red and white manicure close-up
    pexels(6135675),  // Person's hand getting a manicure
    pexels(34971940), // Stylish turquoise nail art
    pexels(6135685),  // Person getting a manicure
    pexels(34835291), // Stylish floral nail art on hand
    pexels(5871915),  // Beautiful manicured nails
  ],
  braids: [
    pexels(13212603), // Person braiding a woman's hair
    pexels(10810251), // Close up of woman with braided hair
    pexels(7607802),  // Close-up of woman with braided hairstyle
    pexels(10283310), // Woman with braided hair
    pexels(7190007),  // Side profile of woman with braided hair
    pexels(4671331),  // Braids hairstyle
  ],
};

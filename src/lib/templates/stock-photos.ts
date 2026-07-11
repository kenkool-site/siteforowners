import type { BusinessType } from "@/lib/ai/types";

// All images from Pexels (free for commercial use, no attribution required)
// Curated per vertical — verified accessible as of 2026-04-11

export const pexels = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;

const BASE_STOCK_PHOTOS = {
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
    pexels(19803587), // Black woman with braided hair, warm studio portrait
    pexels(20644320), // Portrait of woman with braid
    pexels(20653016), // Model with braided hair
    pexels(10919399), // Black woman with braided hair lifestyle portrait
    pexels(10810251), // Close-up braided hairstyle
    pexels(7607802),  // Braided hairstyle close-up
    pexels(10283310), // Woman with braided hair
    pexels(7190007),  // Side profile with braids
    pexels(13212603), // Braiding service in progress
    pexels(4671331),  // Protective hairstyle portrait
  ],
  locs: [
    pexels(4603683),  // Woman wearing dreadlocks with hair flying
    pexels(6593509),  // Woman with dreadlocks in studio lighting
    pexels(8689920),  // Woman with dreadlocks portrait
    pexels(4671331),  // Textured protective hairstyle
    pexels(7190007),  // Natural hair side profile
    pexels(10283310), // Natural hair portrait
    pexels(10810251), // Protective style close-up
    pexels(7607802),  // Textured hairstyle close-up
    pexels(19803587), // Black woman with braided hair portrait
    pexels(20644320), // Woman with braid portrait
  ],
} satisfies Record<Exclude<BusinessType, "locs_and_braids" | "home_services">, string[]>;

const HOME_SERVICES_STOCK_PHOTOS = [
  pexels(34319671),
  pexels(37720375),
  pexels(37601618),
  pexels(12919779),
  pexels(30958777),
];

export const STOCK_PHOTOS: Record<BusinessType, string[]> = {
  ...BASE_STOCK_PHOTOS,
  home_services: HOME_SERVICES_STOCK_PHOTOS,
  // Combined "Locs & Braids": merge both photo pools for hero + gallery variety.
  locs_and_braids: [...BASE_STOCK_PHOTOS.braids, ...BASE_STOCK_PHOTOS.locs],
};

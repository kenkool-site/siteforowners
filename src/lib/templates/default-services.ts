import type { BusinessType, ServiceItem } from '@/lib/ai/types';
import { pexels } from '@/lib/templates/stock-photos';

// Per-service default photos for the fallback service cards shown when a tenant
// has no real images (no Google Maps photos, no booking-app images, no uploads).
// Unlike the hero stock photos, each image here is hand-picked to depict its
// specific service. All Pexels (free, commercial use, no attribution required);
// every URL verified accessible (HTTP 200) as of 2026-06-08.

const BASE_SERVICES = {
  salon: [
    { name: 'Wash & Blowout', price: '$45', image: pexels(7440133) },   // Stylist blow-drying client's hair with round brush
    { name: 'Haircut & Style', price: '$65', image: pexels(3993453) },  // Close-up of shears cutting wet hair at the nape
    { name: 'Color Treatment', price: '$120', image: pexels(3993323) }, // Gloved hands applying hair color to sectioned roots
    { name: 'Deep Conditioning', price: '$35', image: pexels(3993449) },// Client at the wash basin, product worked through hair
    { name: 'Silk Press', price: '$85', image: pexels(3738359) },       // Flat iron pressing a held strand of hair
    { name: 'Keratin Treatment', price: '$200', image: pexels(3738339) },// Flat iron smoothing/sealing the hair
  ],
  barbershop: [
    { name: 'Classic Haircut', price: '$25', image: pexels(1836983) },        // Barber combing and cutting a client's hair, fade visible
    { name: 'Haircut & Beard Trim', price: '$35', image: pexels(4625615) },   // Beard trimmed with clippers, hair sectioned mid-cut
    { name: 'Beard Shape-Up', price: '$15', image: pexels(3998417) },         // Scissors shaping a full beard along the jawline
    { name: 'Hot Towel Shave', price: '$30', image: pexels(7697492) },        // Hot towel applied over a reclined client's face
    { name: 'Kids Haircut', price: '$18', image: pexels(7697364) },           // Young boy in a barber cape getting a clipper cut
    { name: 'Line-Up / Edge-Up', price: '$15', image: pexels(4663135) },      // Trimmer detailing a crisp neckline/hairline edge
  ],
  restaurant: [
    { name: 'Appetizers', price: 'from $8', image: pexels(1439328) },          // Cheese/feta board with basil and dipping sauce
    { name: 'Main Courses', price: 'from $15', image: pexels(323682) },        // Rack of lamb chops with roasted vegetables
    { name: 'Daily Specials', price: '$12', image: pexels(30469688) },         // Fine-dining tasting spread of small chef's plates
    { name: 'Desserts', price: 'from $7', image: pexels(132694) },             // Slice of chocolate cake with a strawberry
    { name: 'Beverages', price: 'from $3', image: pexels(14387126) },          // Green juice/cocktail in a glass with basil
    { name: 'Catering', price: 'Call for pricing', image: pexels(32689477) },  // Buffet line with chafing dishes and a server
  ],
  nails: [
    { name: 'Classic Manicure', price: '$25', image: pexels(3997386) },     // Hands with glossy solid red polish on a salon towel
    { name: 'Gel Manicure', price: '$40', image: pexels(3997392) },         // Hand under a UV/LED lamp curing gel polish
    { name: 'Classic Pedicure', price: '$35', image: pexels(4004460) },     // Bare feet with freshly painted red toenails
    { name: 'Acrylic Full Set', price: '$55', image: pexels(7990099) },     // Technician filing/shaping a client's nails
    { name: 'Nail Art (per nail)', price: '$5', image: pexels(5870539) },   // Hand with distinct swirl nail-art designs per nail
    { name: 'Gel Removal', price: '$15', image: pexels(6498015) },          // Technician filing down a nail (removal/filing step)
  ],
  braids: [
    { name: 'Medium Knotless Braids', price: '$180+', image: pexels(28635266) },    // Long neat thin braids, flat scalp attachment
    { name: 'Boho Knotless Braids', price: '$220+', image: pexels(15290427) },      // Braids with loose curly boho ends
    { name: 'Medium Box Braids', price: '$160+', image: pexels(13774886) },         // Medium-thickness shoulder-length box braids
    { name: 'Cornrows / Feed-In Braids', price: '$90+', image: pexels(19056783) },  // Scalp cornrows feeding into long braids
    { name: 'Stitch Braids', price: '$120+', image: pexels(19328704) },             // Neat, evenly parted straight-back cornrows
    { name: 'Crochet Braids', price: '$140+', image: pexels(5301532) },             // Long braids with loose curly textured ends
    { name: 'Fulani Braids', price: '$180+', image: pexels(11515382) },             // Long thin braids with a center part
    { name: 'Lemonade Braids', price: '$150+', image: pexels(31280257) },           // Long side-falling braids over one shoulder
    { name: 'Kids Braids', price: '$110+', image: pexels(8080929) },                // Young child with small braided hair
    { name: "Men's Braids / Cornrows", price: '$70+', image: pexels(34443840) },    // Man with clear straight-back cornrows
  ],
  locs: [
    { name: 'Loc Consultation', price: '$25', image: pexels(14081430) },              // Man with mature shoulder-length locs, portrait
    { name: 'Wash & Retwist', price: '$120+', image: pexels(1413051) },               // Close-up of neatly retwisted medium locs
    { name: 'Retwist & Style', price: '$150+', image: pexels(7431435) },              // Locs pulled into a high bun/updo
    { name: 'Starter Locs', price: '$250+', image: pexels(6311627) },                 // Short early-stage coiled starter locs
    { name: 'Two-Strand Twist Loc Style', price: '$35+', image: pexels(1845923) },    // Short separated twisted locs standing up
    { name: 'Interlocking Maintenance', price: '$180+', image: pexels(11815106) },    // Tight, uniform short locs, neat roots
    { name: 'Instant Locs', price: '$350+', image: pexels(5702325) },                 // Short, fully-formed compact locs
    { name: 'Loc Repair', price: '$25 per loc', image: pexels(3864777) },             // Established mature locs with headwraps
    { name: 'Faux Locs', price: '$220+', image: pexels(10983527) },                   // Long full locs adorned with cowrie shells
    { name: 'Microloc Retie', price: '$225+', image: pexels(10013272) },              // Many thin small-diameter locs with cuffs
  ],
} satisfies Record<Exclude<BusinessType, "locs_and_braids">, ServiceItem[]>;

export const DEFAULT_SERVICES: Record<BusinessType, ServiceItem[]> = {
  ...BASE_SERVICES,
  // Combined "Locs & Braids" — a tight, curated mix of the most-requested
  // services from both verticals (4 braids + 4 locs), reusing the curated photos.
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

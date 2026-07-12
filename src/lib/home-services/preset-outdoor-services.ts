import type { PreviewData } from "@/lib/ai/types";
import { HOME_SERVICES_CONTENT_DEFAULTS } from "./content-defaults";

const SERVICES = [
  "Sprinkler Installation and Repair",
  "Lawn Mowing and Maintenance",
  "Sod and Grass Installation",
  "Landscaping",
  "Tree Trimming",
  "Yard Cleanup",
  "Mulching",
  "Seasonal Maintenance",
] as const;

const toClientId = (serviceName: string): string =>
  serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildOutdoorServicesPreset(): PreviewData {
  const services = SERVICES.map((name) => ({ name, client_id: toClientId(name), price: "" }));

  return {
    business_name: "Greenline Outdoor Services",
    business_type: "home_services",
    color_theme: "home_services_neighborhood",
    services,
    generated_copy: {
      en: {
        hero_headline: "Outdoor care that keeps your property ready year-round",
        hero_subheadline: "Reliable scheduling for homes and businesses across your area.",
        about_paragraphs: [
          "Greenline Outdoor Services provides practical outdoor maintenance with clear communication and consistent follow-through.",
          "Our team supports homeowners and property managers with seasonal and routine service plans.",
        ],
        service_descriptions: {
          "sprinkler-installation-and-repair": "Install, tune, and repair sprinkler zones to keep coverage even and efficient.",
          "lawn-mowing-and-maintenance": "Routine mowing, edging, and cleanup to keep your lawn neat every visit.",
          "sod-and-grass-installation": "Prepare soil and install fresh grass for durable, even lawn coverage.",
          landscaping: "Refresh curb appeal with planting, shaping, and bed improvements for outdoor spaces.",
          "tree-trimming": "Trim overgrowth and shape trees for healthier growth and safer clearances.",
          "yard-cleanup": "Remove leaves, debris, and overgrowth to reset and maintain clean outdoor areas.",
          mulching: "Add mulch to protect roots, reduce weeds, and improve the look of beds.",
          "seasonal-maintenance": "Spring and fall service bundles to keep outdoor systems and yards in order.",
        },
        seo_title: "Greenline Outdoor Services | Landscaping and Lawn Care",
        seo_description: "Bilingual outdoor services for lawn care, irrigation, cleanup, and seasonal maintenance.",
        footer_tagline: "Outdoor service plans built for your neighborhood.",
        google_business_description: "Greenline Outdoor Services offers lawn care, landscaping, irrigation, cleanup, and seasonal outdoor maintenance in English and Spanish.",
      },
      es: {
        hero_headline: "Cuidado exterior para mantener su propiedad lista todo el año",
        hero_subheadline: "Programación confiable para hogares y comercios en su zona.",
        about_paragraphs: [
          "Greenline Outdoor Services brinda mantenimiento exterior práctico con comunicación clara y seguimiento constante.",
          "Nuestro equipo apoya a propietarios y administradores con planes de servicio estacionales y de rutina.",
        ],
        service_descriptions: {
          "sprinkler-installation-and-repair": "Instalamos, ajustamos y reparamos zonas de riego para una cobertura uniforme.",
          "lawn-mowing-and-maintenance": "Corte, bordeado y limpieza para mantener su césped ordenado en cada visita.",
          "sod-and-grass-installation": "Preparamos el suelo e instalamos césped nuevo para una cobertura pareja.",
          landscaping: "Mejoramos el frente con plantación, forma y renovación de jardineras.",
          "tree-trimming": "Podamos crecimiento excesivo para mejor salud y espacios más seguros.",
          "yard-cleanup": "Retiramos hojas, residuos y exceso de vegetación para dejar el patio limpio.",
          mulching: "Aplicamos mulch para proteger raíces, reducir maleza y mejorar la apariencia.",
          "seasonal-maintenance": "Paquetes de primavera y otoño para mantener patios y sistemas en buen estado.",
        },
        seo_title: "Greenline Outdoor Services | Jardinería y Césped",
        seo_description: "Servicios exteriores bilingües para césped, riego, limpieza y mantenimiento estacional.",
        footer_tagline: "Planes de servicio exterior para su vecindario.",
        google_business_description: "Greenline Outdoor Services ofrece cuidado de césped, jardinería, riego, limpieza y mantenimiento estacional en inglés y español.",
      },
      home_services_config: {
        trust_points: [
          { id: "free-estimates", label_en: "Free estimates", label_es: "Estimados gratis" },
          { id: "residential-commercial", label_en: "Residential and commercial service", label_es: "Servicio residencial y comercial" },
          { id: "english-spanish", label_en: "English and Spanish support", label_es: "Atención en inglés y español" },
        ],
        gallery_projects: [],
        why_us_points: [],
        section_copy: HOME_SERVICES_CONTENT_DEFAULTS.section_copy,
        process_steps: HOME_SERVICES_CONTENT_DEFAULTS.process_steps,
        service_areas: [],
        coverage_summary_en: "",
        coverage_summary_es: "",
        message_links: {},
        sections: {},
      },
    },
  };
}

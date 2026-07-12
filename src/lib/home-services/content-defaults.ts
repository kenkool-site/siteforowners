import type {
  HomeServicesProcessStep,
  HomeServicesSectionCopy,
  HomeServicesSectionCopyConfig,
  HomeServicesSectionKey,
} from "./types";

type CompleteSectionCopy = Required<HomeServicesSectionCopy>;

export const HOME_SERVICES_CONTENT_DEFAULTS: {
  section_copy: Record<HomeServicesSectionKey, CompleteSectionCopy>;
  process_steps: HomeServicesProcessStep[];
} = {
  section_copy: {
    services: { eyebrow_en: "Our services", title_en: "How we can help", intro_en: "Reliable help for the work your home needs.", eyebrow_es: "Nuestros servicios", title_es: "Cómo podemos ayudar", intro_es: "Ayuda confiable para el trabajo que necesita su hogar." },
    recent_work: { eyebrow_en: "Recent work", title_en: "See the difference", intro_en: "A look at projects completed for local homeowners.", eyebrow_es: "Trabajo reciente", title_es: "Vea la diferencia", intro_es: "Conozca proyectos realizados para propietarios locales." },
    process: { eyebrow_en: "How it works", title_en: "A simple path to getting it done", intro_en: "Clear communication from the first message through the finished work.", eyebrow_es: "Cómo funciona", title_es: "Una forma sencilla de hacerlo", intro_es: "Comunicación clara desde el primer mensaje hasta terminar el trabajo." },
    reviews: { eyebrow_en: "Reviews", title_en: "Trusted by local homeowners", intro_en: "See what customers say about their experience.", eyebrow_es: "Reseñas", title_es: "La confianza de propietarios locales", intro_es: "Conozca lo que dicen los clientes sobre su experiencia." },
    service_areas: { eyebrow_en: "Service areas", title_en: "Proudly serving our community", intro_en: "Find your city or ZIP code in our local coverage area.", eyebrow_es: "Áreas de servicio", title_es: "Sirviendo con orgullo a nuestra comunidad", intro_es: "Encuentre su ciudad o código postal en nuestra zona de servicio." },
    final_cta: { eyebrow_en: "Ready to start?", title_en: "Let’s talk about your project", intro_en: "Tell us what you need and request your free estimate today.", eyebrow_es: "¿Listo para comenzar?", title_es: "Hablemos de su proyecto", intro_es: "Cuéntenos qué necesita y solicite hoy su estimado gratis." },
  },
  process_steps: [
    { id: "tell-us", title_en: "Tell us what you need", body_en: "Share a few details about your project.", title_es: "Cuéntenos qué necesita", body_es: "Comparta algunos detalles sobre su proyecto." },
    { id: "get-estimate", title_en: "Get your estimate", body_en: "We’ll review the work and provide a clear estimate.", title_es: "Reciba su estimado", body_es: "Revisaremos el trabajo y le daremos un estimado claro." },
    { id: "schedule-work", title_en: "Schedule the work", body_en: "Choose a convenient time to get the job done.", title_es: "Programe el trabajo", body_es: "Elija un horario conveniente para realizar el trabajo." },
  ],
};

export function resolveHomeServicesSectionCopy(
  section: HomeServicesSectionKey,
  configured?: HomeServicesSectionCopy,
): CompleteSectionCopy {
  const resolved = { ...HOME_SERVICES_CONTENT_DEFAULTS.section_copy[section] };
  if (!configured) return resolved;
  for (const [key, value] of Object.entries(configured) as [keyof HomeServicesSectionCopy, string | undefined][]) {
    if (value?.trim()) resolved[key] = value.trim();
  }
  return resolved;
}

export function resolveHomeServicesProcessSteps(
  configured?: HomeServicesProcessStep[],
): HomeServicesProcessStep[] {
  return configured?.length ? configured.slice(0, 3) : HOME_SERVICES_CONTENT_DEFAULTS.process_steps;
}

export function resolveHomeServicesSectionCopies(
  configured?: HomeServicesSectionCopyConfig,
): Record<HomeServicesSectionKey, CompleteSectionCopy> {
  return Object.fromEntries(
    (Object.keys(HOME_SERVICES_CONTENT_DEFAULTS.section_copy) as HomeServicesSectionKey[])
      .map((section) => [section, resolveHomeServicesSectionCopy(section, configured?.[section])]),
  ) as Record<HomeServicesSectionKey, CompleteSectionCopy>;
}

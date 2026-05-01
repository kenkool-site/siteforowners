import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface ServiceItem {
  name: string;
  price?: string;
  durationMinutes?: number;
  description?: string;
  category?: string;
  addOns?: Array<{ name: string; price_delta: number; duration_delta_minutes: number }>;
}

export default async function PreviewAdminServices({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createAdminClient();
  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name, services, categories")
    .eq("slug", params.slug)
    .single();

  if (!preview) notFound();

  const services = ((preview.services as ServiceItem[] | null) || []).filter((s) => s?.name?.trim());
  const categories = (preview.categories as string[] | null) || [];

  // Group by category if present, otherwise a single "All" group.
  const groups: Array<{ name: string; items: ServiceItem[] }> = [];
  if (categories.length > 0) {
    for (const cat of categories) {
      const items = services.filter((s) => (s.category || "").trim() === cat);
      if (items.length > 0) groups.push({ name: cat, items });
    }
    const uncategorized = services.filter((s) => !s.category || !categories.includes(s.category));
    if (uncategorized.length > 0) groups.push({ name: "Other", items: uncategorized });
  } else {
    groups.push({ name: "All services", items: services });
  }

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Services</div>
        <div className="text-xs text-gray-500">{services.length} total</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-5">
        {services.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No services configured yet.
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.name}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 px-1">
                {g.name}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {g.items.map((s, i) => (
                  <div key={`${g.name}-${i}-${s.name}`} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{s.name}</div>
                        {s.description && (
                          <div className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</div>
                        )}
                        {(s.addOns?.length ?? 0) > 0 && (
                          <div className="text-[11px] text-gray-400 mt-1.5">
                            {s.addOns!.length} add-on{s.addOns!.length === 1 ? "" : "s"}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-[color:var(--admin-primary)]">
                          {s.price || "—"}
                        </div>
                        {s.durationMinutes && (
                          <div className="text-[11px] text-gray-500 mt-0.5">{s.durationMinutes} min</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <div className="px-4 md:px-8 mt-6 text-xs text-gray-400 italic">
        Read-only in demo mode — service edits go live once you start your subscription.
      </div>
    </div>
  );
}

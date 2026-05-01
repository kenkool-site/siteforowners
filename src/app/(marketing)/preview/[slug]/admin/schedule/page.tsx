import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMockAdminData, type MockBooking } from "@/lib/preview-admin-mock";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diff = Math.round((date.getTime() - todayUtc.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${DAY_NAMES[date.getUTCDay()]}, ${MONTH_NAMES[date.getUTCMonth()].slice(0, 3)} ${date.getUTCDate()}`;
}

function groupByDate(bookings: MockBooking[]): Map<string, MockBooking[]> {
  const map = new Map<string, MockBooking[]>();
  for (const b of bookings) {
    const list = map.get(b.booking_date) || [];
    list.push(b);
    map.set(b.booking_date, list);
  }
  return map;
}

export default async function PreviewAdminSchedule({
  params,
}: {
  params: { slug: string };
}) {
  const supabase = createAdminClient();
  const { data: preview } = await supabase
    .from("previews")
    .select("slug, business_name, business_type, services, checkout_mode")
    .eq("slug", params.slug)
    .single();

  if (!preview) notFound();

  const mock = buildMockAdminData({
    slug: preview.slug as string,
    business_name: preview.business_name as string | null,
    business_type: preview.business_type as string | null,
    services: (preview.services as Array<{ name: string; price?: string; durationMinutes?: number }> | null) || [],
    checkout_mode: preview.checkout_mode as string | null,
  });

  const grouped = groupByDate(mock.schedule);
  const dates = Array.from(grouped.keys()).sort();

  return (
    <div className="py-4 md:py-6">
      <div className="px-4 md:px-8 flex items-baseline justify-between">
        <div className="text-lg font-semibold">Schedule</div>
        <div className="text-xs text-gray-500">{mock.schedule.length} upcoming</div>
      </div>

      <div className="px-3 md:px-8 mt-4 space-y-5">
        {dates.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
            No bookings yet.
          </div>
        ) : (
          dates.map((date) => (
            <section key={date}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2 px-1">
                {dateLabel(date)}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {grouped.get(date)!.map((b) => (
                  <div key={b.id} className="px-4 py-3 border-b border-gray-100 last:border-b-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span>{b.customer_name}</span>
                        {b.status === "pending" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            PENDING DEPOSIT
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 truncate">
                        {b.service_name} · {b.duration_minutes} min
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-[color:var(--admin-primary)] shrink-0">
                      {b.booking_time}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

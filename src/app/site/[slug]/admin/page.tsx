import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getOwnerName(slug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("owner_name")
    .eq("preview_slug", slug)
    .maybeSingle();
  return (data?.owner_name as string) ?? "there";
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AdminHome({ params }: { params: { slug: string } }) {
  const ownerName = await getOwnerName(params.slug);
  return (
    <div className="px-4 py-5 md:px-8 md:py-6">
      <div className="text-lg font-semibold">
        {greeting()}, {ownerName.split(" ")[0]}
      </div>
      <div className="text-sm text-gray-500 mt-1">Here&apos;s what&apos;s happening today</div>
      <div className="mt-6 text-sm text-gray-400">
        Your dashboard is getting set up. Stats and activity will appear here soon.
      </div>
    </div>
  );
}

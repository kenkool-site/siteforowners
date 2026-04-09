import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PreviewData } from "@/lib/ai/types";
import { CompareClient } from "./CompareClient";

async function getGroupPreviews(groupId: string): Promise<PreviewData[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("previews")
    .select("*")
    .eq("group_id", groupId)
    .order("variant_label", { ascending: true });

  if (error || !data || data.length === 0) return [];
  return data as PreviewData[];
}

export default async function ComparePage({
  params,
}: {
  params: { groupId: string };
}) {
  const previews = await getGroupPreviews(params.groupId);

  if (previews.length === 0) {
    notFound();
  }

  return <CompareClient previews={previews} groupId={params.groupId} />;
}

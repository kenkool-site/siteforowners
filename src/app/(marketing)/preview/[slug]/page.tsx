import { notFound } from "next/navigation";
import type { PreviewData } from "@/lib/ai/types";
import { PreviewClient } from "./PreviewClient";

async function getPreviewData(slug: string): Promise<PreviewData | null> {
  // MVP: read from /tmp file system
  // TODO: Week 2 — read from Supabase previews table
  try {
    const fs = await import("fs/promises");
    const data = await fs.readFile(
      `/tmp/siteforowners-previews/${slug}.json`,
      "utf-8"
    );
    return JSON.parse(data) as PreviewData;
  } catch {
    return null;
  }
}

export default async function PreviewPage({
  params,
}: {
  params: { slug: string };
}) {
  const data = await getPreviewData(params.slug);

  if (!data) {
    notFound();
  }

  return <PreviewClient data={data} slug={params.slug} />;
}

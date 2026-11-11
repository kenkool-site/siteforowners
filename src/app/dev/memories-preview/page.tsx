import { notFound } from "next/navigation";
import { MemoriesDesignPreview } from "@/components/invitations/memories/MemoriesDesignPreview";

export const dynamic = "force-dynamic";

export default function MemoriesDesignPreviewPage({ searchParams }: { searchParams: { screen?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <MemoriesDesignPreview screen={searchParams.screen ?? "gallery"} />;
}

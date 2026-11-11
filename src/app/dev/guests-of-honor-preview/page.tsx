import { notFound } from "next/navigation";
import { GuestsOfHonorPreview } from "@/components/invitations/memories/GuestsOfHonorPreview";

export const dynamic = "force-dynamic";

export default function GuestsOfHonorPreviewPage({ searchParams }: { searchParams: { variant?: string; screen?: string } }) {
  if (process.env.NODE_ENV === "production") notFound();
  const variant = searchParams.variant === "birthday" ? "birthday" : "wedding";
  return <GuestsOfHonorPreview variant={variant} screen={searchParams.screen ?? "settings"} />;
}

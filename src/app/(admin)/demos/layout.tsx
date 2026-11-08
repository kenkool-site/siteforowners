import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  const session = cookies().get("admin_session")?.value;
  if (!hasFounderInvitationSession(process.env.ADMIN_PASSWORD, session)) {
    redirect("/login");
  }
  return children;
}

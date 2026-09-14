import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";

export default function FounderInvitationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionCookie = cookies().get("admin_session")?.value;
  if (!hasFounderInvitationSession(process.env.ADMIN_PASSWORD, sessionCookie)) {
    redirect("/login");
  }
  return children;
}

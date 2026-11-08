import type { Metadata } from "next";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { InvitationLoginForm } from "./InvitationLoginForm";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type InvitationLoginPageProps = {
  searchParams?: { lang?: string | string[] };
};

export default function InvitationLoginPage({
  searchParams,
}: InvitationLoginPageProps) {
  const locale = searchParams?.lang === "es" ? "es" : "en";

  return (
    <InvitationPublicProvider locale={locale} timeZone="UTC">
      <InvitationLoginForm />
    </InvitationPublicProvider>
  );
}

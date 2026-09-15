import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { InvitationLoginForm } from "./InvitationLoginForm";

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

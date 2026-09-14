import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../../messages/en.json";
import esMessages from "../../../../messages/es.json";
import { InvitationLoginForm } from "./InvitationLoginForm";

type InvitationLoginPageProps = {
  searchParams?: { lang?: string | string[] };
};

export default function InvitationLoginPage({
  searchParams,
}: InvitationLoginPageProps) {
  const locale = searchParams?.lang === "es" ? "es" : "en";
  const messages = locale === "es" ? esMessages : enMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <InvitationLoginForm />
    </NextIntlClientProvider>
  );
}

import { useTranslations } from "next-intl";

export function InvitationFooter() {
  const t = useTranslations("invitations.public.footer");
  return (
    <footer className="px-5 pb-24 pt-14 text-center text-xs opacity-65">
      <a href="https://www.siteforowners.com/" className="underline decoration-current/40 underline-offset-4">{t("poweredBy")}</a>
      <span aria-hidden="true" className="mx-2">·</span>
      <a href="https://www.siteforowners.com/invitations/login" className="underline decoration-current/40 underline-offset-4">{t("hostSignIn")}</a>
    </footer>
  );
}

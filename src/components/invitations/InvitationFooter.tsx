import { useTranslations } from "next-intl";

export function InvitationFooter({ slug }: { slug: string }) {
  const t = useTranslations("invitations.public.footer");
  return (
    <footer data-invitation-footer="true" className="px-5 pb-24 pt-14 text-center text-xs">
      <p className="font-medium">
        <a href={`https://www.invitespot.app/?from=${encodeURIComponent(slug)}`} className="underline decoration-current/40 underline-offset-4">{t("marketingCta")}</a>
      </p>
      <p className="mt-2 opacity-65">
        <a href="https://www.invitespot.app/" className="underline decoration-current/40 underline-offset-4">{t("poweredBy")}</a>
        <span aria-hidden="true" className="mx-2">·</span>
        <a href="https://www.siteforowners.com/invitations/login" className="underline decoration-current/40 underline-offset-4">{t("hostSignIn")}</a>
      </p>
    </footer>
  );
}

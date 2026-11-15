import { useTranslations } from "next-intl";
import { eventSiteGuestUrl } from "@/lib/invitations/event-site";
import { eventDisplayClass } from "./event-display";

export function InvitationFooter({ slug, brandingEnabled = true }: { slug: string; brandingEnabled?: boolean }) {
  const t = useTranslations("invitations.public.footer");
  return (
    <footer id="invitation-footer" data-invitation-footer="true" className="px-6 pb-16 pt-8 text-center">
      {brandingEnabled && (
        <div className="flex flex-col items-center gap-2">
          <span aria-hidden="true" className={`grid size-7 place-items-center rounded-lg bg-[#1A3D24] text-[15px] font-semibold text-white ${eventDisplayClass}`}>i</span>
          <p className="text-[13.5px] font-medium text-[#14261A]">{t("madeWith")}</p>
          <a href={eventSiteGuestUrl(slug, "footer")} className="text-[13px] font-medium text-[#1A3D24] underline decoration-[#1A3D24]/30 underline-offset-4">{t("getPage")}</a>
        </div>
      )}
      <p className={`${brandingEnabled ? "mt-2.5" : ""} text-[11.5px] text-[#5E6F61]`}>
        {brandingEnabled && (
          <>
            <a href={eventSiteGuestUrl(slug, "powered")} className="underline decoration-current/40 underline-offset-4">{t("poweredBy")}</a>
            <span aria-hidden="true" className="mx-1.5">·</span>
          </>
        )}
        <a href="https://www.siteforowners.com/invitations/login" className="underline decoration-current/40 underline-offset-4">{t("hostSignIn")}</a>
      </p>
    </footer>
  );
}

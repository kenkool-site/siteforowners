"use client";
import { useTranslations } from "next-intl";
import { InvitationPreview } from "./InviteSpotPreview";
import styles from "./styles";
export function InviteSpotInvitesShowcase() {
  const t = useTranslations("invitespot.invites");
  return <section id="invitations" className={styles.examplesSection}><div className={styles.sectionCopy}><p className={styles.eyebrow}>{t("eyebrow")}</p><h2>{t("heading")}</h2><p className={styles.body}>{t("body")}</p><p className={styles.highlights}>{t("highlights")}</p></div><div className={styles.examples}>{(["wedding", "birthday", "naming"] as const).map(occasion => <figure key={occasion}><InvitationPreview occasion={occasion} /><figcaption><h3>{t(occasion)}</h3><p>{t(`${occasion}Caption`)}</p></figcaption></figure>)}</div></section>;
}

"use client";
import { useTranslations } from "next-intl";
import { GalleryPreview, InvitationPreview } from "./InviteSpotPreview";
import styles from "./styles";
export function InviteSpotHero() {
  const t = useTranslations("invitespot.hero");
  const preview = useTranslations("invitespot.preview");
  return <section className={styles.hero}>
    <div className={styles.heroCopy}><p className={styles.eyebrow}>{t("eyebrow")}</p><h1>{t("title")} <span>{t("accent")}</span></h1><p className={styles.body}>{t("subtitle")}</p><div className={styles.actions}><a href="#event-form" className={styles.primary}>{t("cta")}</a><a href="#invitations" className={styles.secondary}>{t("secondary")}</a></div><p className={styles.occasions}>{t("occasions")}</p></div>
    <div><div className={styles.heroVisual}><InvitationPreview hero /><GalleryPreview compact /></div><p className={styles.previewLabel}>{preview("sample")}</p></div>
  </section>;
}

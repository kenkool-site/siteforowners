"use client";
import { useTranslations } from "next-intl";
import { GalleryPreview } from "./InviteSpotPreview";
import styles from "./styles";
export function InviteSpotMemoriesShowcase() {
 const t = useTranslations("invitespot.memories");
 return <section id="memories" className={styles.memoriesSection}><div className={styles.sectionCopy}><p className={styles.eyebrow}>{t("eyebrow")}</p><h2>{t("heading")}</h2><p className={styles.body}>{t("body")}</p><p className={styles.highlights}>{t("highlights")}</p><p className={styles.note}>{t("note")}</p></div><GalleryPreview /></section>;
}

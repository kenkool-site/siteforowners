"use client";
import { useTranslations } from "next-intl";
import { PanelsTopLeft, Users, Mail, Camera, Images, ShieldCheck } from "lucide-react";
import styles from "./styles";
const features = [{key:"site",icon:PanelsTopLeft},{key:"rsvp",icon:Users},{key:"comms",icon:Mail},{key:"media",icon:Camera},{key:"ai",icon:Images},{key:"privacy",icon:ShieldCheck}] as const;
export function InviteSpotFeatures() {
 const t = useTranslations("invitespot.features");
 return <section className={styles.featuresSection}><p className={styles.eyebrow}>{t("eyebrow")}</p><h2>{t("heading")}</h2><div className={styles.features}>{features.map(({key,icon:Icon})=><div key={key}><Icon size={32} strokeWidth={1.4} aria-hidden="true" /><div><h3>{t(`${key}Title`)}</h3><p>{t(`${key}Body`)}</p></div></div>)}</div></section>;
}

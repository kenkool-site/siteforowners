"use client";
import { useTranslations } from "next-intl";
import styles from "./styles";
export function InviteSpotHowItWorks() {
 const t = useTranslations("invitespot");
 return <section className={styles.howSection}><div><p className={styles.eyebrow}>{t("howItWorks.heading")}</p></div><div className={styles.steps}>{(["step1","step2","step3"] as const).map((key,index)=><div key={key}><span className={styles.stepNumber}>{index+1}</span><div><h3>{t(`howItWorks.${key}.title`)}</h3><p>{t(`howItWorks.${key}.body`)}</p></div></div>)}</div></section>;
}

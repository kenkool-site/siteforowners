"use client";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import type { EstimateDeliveryMode } from "./estimate-modal-state";

export function HomeServicesEstimateForm({ services, service, colors, deliveryMode, onComplete }: { services: ServiceItem[]; service: string; colors: ThemeColors; deliveryMode: EstimateDeliveryMode; onComplete: () => void }) {
  const t = useTranslations("homeServices"); const id = useId();
  const [stage,setStage]=useState(1); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const [form,setForm]=useState({name:"",phone:"",service,location:"",description:"",preferredResponse:"sms"}); const [photos,setPhotos]=useState<File[]>([]);
  const field=(key:keyof typeof form)=>(e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>setForm({...form,[key]:e.target.value});
  const submit=async(e:React.FormEvent)=>{e.preventDefault(); setError(""); if(!form.name.trim()||!form.phone.trim()||!form.service.trim()||!form.location.trim()){setError(t("estimate.errors.required"));setStage(1);return} setBusy(true); try { if(deliveryMode==="preview_mock") await new Promise(r=>setTimeout(r,500)); else { const body=new FormData(); Object.entries(form).forEach(([k,v])=>body.set(k==="preferredResponse"?"preferred_response":k,v)); photos.forEach(photo=>body.append("photos",photo)); const response=await fetch("/api/estimate",{method:"POST",body}); if(!response.ok) throw new Error(); } onComplete(); } catch {setError(t("estimate.unavailable"))} finally {setBusy(false)}};
  const input="w-full rounded-xl border px-3 py-2.5 text-base"; const style={backgroundColor:colors.muted,borderColor:`${colors.foreground}25`};
  return <form onSubmit={submit} noValidate>
    <p className="mb-4 text-sm font-semibold">{stage} {t("estimate.modal.of")} 2 · {t(stage===1?"estimate.modal.stageContact":"estimate.modal.stageProject")}</p>{error&&<p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {stage===1?<div className="space-y-4">
      <label className="block">{t("estimate.fields.name.label")}<input id={`${id}-name`} className={input} style={style} value={form.name} onChange={field("name")} /></label>
      <label className="block">{t("estimate.fields.phone.label")}<input className={input} style={style} type="tel" value={form.phone} onChange={field("phone")} /></label>
      <label className="block">{t("estimate.fields.service.label")}<select className={input} style={style} value={form.service} onChange={field("service")}><option value="">{t("estimate.fields.service.placeholder")}</option>{services.map(s=><option key={s.client_id||s.name}>{s.name}</option>)}</select></label>
      <label className="block">{t("estimate.modal.cityZip")}<input className={input} style={style} value={form.location} onChange={field("location")} /></label>
    </div>:<div className="space-y-4">
      <label className="block">{t("estimate.fields.description.label")} <span>{t("estimate.modal.optional")}</span><textarea className={input} style={style} rows={4} value={form.description} onChange={field("description")} /></label>
      <fieldset><legend>{t("estimate.fields.preferredResponse.label")}</legend>{(["sms","call","whatsapp"] as const).map(x=><label key={x} className="mr-4 inline-flex gap-2"><input type="radio" checked={form.preferredResponse===x} onChange={()=>setForm({...form,preferredResponse:x})}/>{t(`estimate.preferredResponse.${x}`)}</label>)}</fieldset>
      <label className="block">{t("estimate.photos.label")}<input className="mt-2 block w-full" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setPhotos(Array.from(e.target.files??[]).slice(0,5))}/></label>
    </div>}
    <div className="mt-6 flex justify-end gap-3">{stage===2&&<button type="button" className="min-h-11 px-4" onClick={()=>setStage(1)}>{t("estimate.modal.back")}</button>}{stage===1?<button type="button" className="min-h-11 rounded-full px-5" style={{backgroundColor:colors.secondary}} onClick={()=>setStage(2)}>{t("estimate.modal.continue")}</button>:<button disabled={busy} className="min-h-11 rounded-full px-5" style={{backgroundColor:colors.secondary}}>{busy?t("estimate.submitting"):t("estimate.modal.submit")}</button>}</div>
  </form>;
}

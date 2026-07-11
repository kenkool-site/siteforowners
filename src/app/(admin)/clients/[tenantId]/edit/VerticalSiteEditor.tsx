"use client";

import { HomeServicesSiteEditor } from "./HomeServicesSiteEditor";
import { SiteEditor, type SiteEditorProps } from "./SiteEditor";

export function VerticalSiteEditor(props: SiteEditorProps) {
  return props.preview.business_type === "home_services"
    ? <HomeServicesSiteEditor {...props} />
    : <SiteEditor {...props} />;
}

"use client";

import { HomeServicesTemplate } from "./home-services/HomeServicesTemplate";
import {
  TemplateOrchestrator,
  type TemplateOrchestratorProps,
} from "./TemplateOrchestrator";

export function TemplateRouter(props: TemplateOrchestratorProps) {
  if (props.data.business_type === "home_services") {
    return (
      <HomeServicesTemplate
        data={props.data}
        locale={props.locale ?? "en"}
        isLive={props.isLive}
      />
    );
  }
  return <TemplateOrchestrator {...props} />;
}

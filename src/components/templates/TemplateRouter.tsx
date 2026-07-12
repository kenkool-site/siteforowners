"use client";

import { HomeServicesTemplate } from "./home-services/HomeServicesTemplate";
import {
  TemplateOrchestrator,
  type TemplateOrchestratorProps,
} from "./TemplateOrchestrator";

export interface TemplateRouterProps extends TemplateOrchestratorProps {
  onHomeServicesLocaleChange?: (locale: "en" | "es") => void;
}

export function TemplateRouter(props: TemplateRouterProps) {
  if (props.data.business_type === "home_services") {
    return (
      <HomeServicesTemplate
        data={props.data}
        locale={props.locale ?? "en"}
        isLive={props.isLive}
        onLocaleChange={props.onHomeServicesLocaleChange}
      />
    );
  }
  return <TemplateOrchestrator {...props} />;
}

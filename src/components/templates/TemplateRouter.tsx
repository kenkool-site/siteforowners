"use client";

import { HomeServicesTemplate } from "./home-services/HomeServicesTemplate";
import {
  TemplateOrchestrator,
  type TemplateOrchestratorProps,
} from "./TemplateOrchestrator";
import type { EstimateDeliveryMode } from "./home-services/estimate-modal-state";

export interface TemplateRouterProps extends TemplateOrchestratorProps {
  onHomeServicesLocaleChange?: (locale: "en" | "es") => void;
  estimateDeliveryMode?: EstimateDeliveryMode;
}

export function TemplateRouter(props: TemplateRouterProps) {
  if (props.data.business_type === "home_services") {
    return (
      <HomeServicesTemplate
        data={props.data}
        locale={props.locale ?? "en"}
        isLive={props.isLive}
        onLocaleChange={props.onHomeServicesLocaleChange}
        estimateDeliveryMode={props.estimateDeliveryMode ?? "tenant"}
      />
    );
  }
  return <TemplateOrchestrator {...props} />;
}

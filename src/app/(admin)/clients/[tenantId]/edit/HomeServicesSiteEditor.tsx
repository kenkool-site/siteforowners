"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TemplateRouter } from "@/components/templates";
import { GalleryEditor } from "@/app/site/[slug]/admin/_components/GalleryEditor";
import { GalleryVideoEditor } from "@/app/site/[slug]/admin/_components/GalleryVideoEditor";
import { AboutImagePicker } from "@/app/site/[slug]/admin/_components/AboutImagePicker";
import type { SiteEditorProps } from "./SiteEditor";
import type { ColorTheme, PreviewData, ServiceItem } from "@/lib/ai/types";
import type { HomeServicesLocale, EstimateDeliveryChannel } from "@/lib/home-services/types";
import {
  parseHomeServicesConfig,
  type HomeServicesConfig,
  type HomeServicesGalleryProject,
  type HomeServicesTrustPoint,
  type HomeServicesWhyUsPoint,
} from "@/lib/home-services/types";
import { THEMES_BY_VERTICAL } from "@/lib/templates/themes";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  EstimateDeliveryDiagnostics,
  NotificationSettingsSection,
} from "./EstimateDeliveryDiagnostics";
import { HomeServicesContentEditor } from "./HomeServicesContentEditor";
import { validateHomeServicesEditorConfig, type HomeServicesEditorError } from "@/lib/home-services/editor-validation";
import { ServiceImageControl } from "./ServiceImageControl";

type LocaleCopyDraft = {
  hero_headline: string;
  hero_subheadline: string;
  about_paragraphs: string[];
  seo_title: string;
  seo_description: string;
  footer_tagline: string;
  google_business_description: string;
  service_descriptions: Record<string, string>;
};

type EditorDraft = {
  business_name: string;
  phone: string;
  color_theme: ColorTheme;
  services: ServiceItem[];
  images: string[];
  hero_video_url: string | null;
  gallery_video_url: string | null;
  gallery_video_title: string;
  about_image_url: string | null;
  generated_copy: {
    en: LocaleCopyDraft;
    es: LocaleCopyDraft;
    section_settings: Record<string, unknown>;
  };
  home_services_config: HomeServicesConfig;
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-sm font-medium text-gray-700">{children}</label>;
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-y rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
    />
  );
}

function toClientId(serviceName: string): string {
  return serviceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function readLocaleCopy(raw: Record<string, unknown> | undefined): LocaleCopyDraft {
  const paragraphs = Array.isArray(raw?.about_paragraphs)
    ? (raw.about_paragraphs as string[]).filter((p) => typeof p === "string")
    : [];
  return {
    hero_headline: (raw?.hero_headline as string) || "",
    hero_subheadline: (raw?.hero_subheadline as string) || "",
    about_paragraphs: paragraphs.length > 0 ? paragraphs : [""],
    seo_title: (raw?.seo_title as string) || "",
    seo_description: (raw?.seo_description as string) || "",
    footer_tagline: (raw?.footer_tagline as string) || "",
    google_business_description: (raw?.google_business_description as string) || "",
    service_descriptions: (raw?.service_descriptions as Record<string, string>) || {},
  };
}

function buildDraft(preview: Record<string, unknown>): EditorDraft {
  const copy = (preview.generated_copy || {}) as Record<string, unknown>;
  const sectionSettings = (copy.section_settings || {}) as Record<string, unknown>;
  const services = ((preview.services as ServiceItem[]) || []).map((service) => ({
    ...service,
    client_id: service.client_id ?? toClientId(service.name),
    price: "",
  }));

  return {
    business_name: (preview.business_name as string) || "",
    phone: (preview.phone as string) || "",
    color_theme: (preview.color_theme as ColorTheme) || "home_services_neighborhood",
    services,
    images: (preview.images as string[]) || [],
    hero_video_url: (preview.hero_video_url as string | null) ?? null,
    gallery_video_url: (preview.gallery_video_url as string | null) ?? null,
    gallery_video_title: (preview.gallery_video_title as string) || "",
    about_image_url: (sectionSettings.about_image_url as string | null) ?? null,
    generated_copy: {
      en: readLocaleCopy(copy.en as Record<string, unknown> | undefined),
      es: readLocaleCopy(copy.es as Record<string, unknown> | undefined),
      section_settings: { ...sectionSettings },
    },
    home_services_config: parseHomeServicesConfig(copy.home_services_config),
  };
}

function BusinessBasicsSection({
  draft,
  onChange,
}: {
  draft: EditorDraft;
  onChange: (next: EditorDraft) => void;
}) {
  return (
    <SectionCard title="Business basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>Business name</FieldLabel>
          <TextInput
            value={draft.business_name}
            onChange={(business_name) => onChange({ ...draft, business_name })}
          />
        </div>
        <div>
          <FieldLabel>Phone</FieldLabel>
          <TextInput
            value={draft.phone}
            onChange={(phone) => onChange({ ...draft, phone })}
            placeholder="(555) 123-4567"
          />
        </div>
      </div>
    </SectionCard>
  );
}

function ThemeSection({
  draft,
  onChange,
}: {
  draft: EditorDraft;
  onChange: (next: EditorDraft) => void;
}) {
  const themes = THEMES_BY_VERTICAL.home_services;
  return (
    <SectionCard title="Theme">
      <div className="flex flex-wrap gap-3">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            onClick={() => onChange({ ...draft, color_theme: theme.id as ColorTheme })}
            className={`rounded-lg border px-4 py-3 text-left transition ${
              draft.color_theme === theme.id
                ? "border-amber-500 bg-amber-50"
                : "border-gray-200 hover:border-amber-300"
            }`}
          >
            <span className="block text-sm font-medium text-gray-900">{theme.name}</span>
            <span className="mt-2 flex gap-1">
              {theme.previewSwatch.map((color) => (
                <span
                  key={color}
                  className="h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function LocaleCopySection({
  draft,
  locale,
  onChange,
}: {
  draft: EditorDraft;
  locale: HomeServicesLocale;
  onChange: (next: EditorDraft) => void;
}) {
  const copy = draft.generated_copy[locale];
  const updateCopy = (patch: Partial<LocaleCopyDraft>) => {
    onChange({
      ...draft,
      generated_copy: {
        ...draft.generated_copy,
        [locale]: { ...copy, ...patch },
      },
    });
  };

  return (
    <SectionCard title={locale === "en" ? "English copy" : "Español"}>
      <div className="space-y-4">
        <div>
          <FieldLabel>Hero headline</FieldLabel>
          <TextInput value={copy.hero_headline} onChange={(hero_headline) => updateCopy({ hero_headline })} />
        </div>
        <div>
          <FieldLabel>Hero subheadline</FieldLabel>
          <TextInput
            value={copy.hero_subheadline}
            onChange={(hero_subheadline) => updateCopy({ hero_subheadline })}
          />
        </div>
        <div>
          <FieldLabel>About paragraphs</FieldLabel>
          <div className="space-y-2">
            {copy.about_paragraphs.map((paragraph, index) => (
              <div key={index} className="flex gap-2">
                <TextArea
                  value={paragraph}
                  onChange={(value) => {
                    const next = [...copy.about_paragraphs];
                    next[index] = value;
                    updateCopy({ about_paragraphs: next });
                  }}
                  rows={2}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = copy.about_paragraphs.filter((_, i) => i !== index);
                    updateCopy({ about_paragraphs: next.length > 0 ? next : [""] });
                  }}
                  className="self-start rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateCopy({ about_paragraphs: [...copy.about_paragraphs, ""] })}
              className="text-sm text-amber-700 hover:text-amber-900"
            >
              Add paragraph
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel>SEO title</FieldLabel>
            <TextInput value={copy.seo_title} onChange={(seo_title) => updateCopy({ seo_title })} />
          </div>
          <div>
            <FieldLabel>Footer tagline</FieldLabel>
            <TextInput value={copy.footer_tagline} onChange={(footer_tagline) => updateCopy({ footer_tagline })} />
          </div>
        </div>
        <div>
          <FieldLabel>SEO description</FieldLabel>
          <TextArea value={copy.seo_description} onChange={(seo_description) => updateCopy({ seo_description })} />
        </div>
        <div>
          <FieldLabel>Google business description</FieldLabel>
          <TextArea
            value={copy.google_business_description}
            onChange={(google_business_description) => updateCopy({ google_business_description })}
          />
        </div>
      </div>
    </SectionCard>
  );
}

function ServicesSection({
  draft,
  contentLocale,
  tenantId,
  onChange,
  onImageChange,
}: {
  draft: EditorDraft;
  contentLocale: HomeServicesLocale;
  tenantId: string;
  onChange: (next: EditorDraft) => void;
  onImageChange: (clientId: string, image: string | undefined) => void;
}) {
  const descriptions = draft.generated_copy[contentLocale].service_descriptions;

  const updateService = (index: number, patch: Partial<ServiceItem>) => {
    const nextServices = draft.services.map((service, i) => {
      if (i !== index) return service;
      const updated = { ...service, ...patch };
      if (patch.name !== undefined) {
        updated.client_id = toClientId(patch.name);
      }
      return updated;
    });
    onChange({ ...draft, services: nextServices });
  };

  const updateDescription = (clientId: string, value: string) => {
    onChange({
      ...draft,
      generated_copy: {
        ...draft.generated_copy,
        [contentLocale]: {
          ...draft.generated_copy[contentLocale],
          service_descriptions: {
            ...descriptions,
            [clientId]: value,
          },
        },
      },
    });
  };

  return (
    <SectionCard title="Services">
      <div className="space-y-4">
        {draft.services.map((service, index) => (
          <div key={service.client_id ?? index} className="rounded-lg border border-gray-100 p-4">
            <FieldLabel>Service name</FieldLabel>
            <TextInput
              value={service.name}
              onChange={(name) => updateService(index, { name })}
            />
            <div className="mt-3">
              <FieldLabel>Description ({contentLocale === "en" ? "English" : "Español"})</FieldLabel>
              <TextArea
                value={descriptions[service.client_id ?? ""] || ""}
                onChange={(value) => updateDescription(service.client_id ?? "", value)}
                rows={2}
              />
            </div>
            <div className="mt-3">
              <FieldLabel>Image</FieldLabel>
              <ServiceImageControl
                image={service.image}
                tenantId={tenantId}
                onChange={(image) => onImageChange(service.client_id ?? "", image)}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...draft, services: draft.services.filter((_, i) => i !== index) })}
              className="mt-2 text-xs text-red-600 hover:text-red-800"
            >
              Remove service
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              services: [
                ...draft.services,
                { name: "", client_id: crypto.randomUUID(), price: "" },
              ],
            })
          }
          className="text-sm font-medium text-amber-700 hover:text-amber-900"
        >
          Add service
        </button>
      </div>
    </SectionCard>
  );
}

function TrustPointsSection({
  config,
  onChange,
}: {
  config: HomeServicesConfig;
  onChange: (next: HomeServicesConfig) => void;
}) {
  const updatePoint = (index: number, patch: Partial<HomeServicesTrustPoint>) => {
    const next = config.trust_points.map((point, i) => (i === index ? { ...point, ...patch } : point));
    onChange({ ...config, trust_points: next });
  };

  return (
    <SectionCard title="Trust points">
      <div className="space-y-3">
        {config.trust_points.map((point, index) => (
          <div key={point.id} className="grid gap-2 rounded-lg border border-gray-100 p-3 sm:grid-cols-2">
            <TextInput value={point.label_en} onChange={(label_en) => updatePoint(index, { label_en })} placeholder="English" />
            <TextInput value={point.label_es} onChange={(label_es) => updatePoint(index, { label_es })} placeholder="Español" />
            <button
              type="button"
              onClick={() => onChange({ ...config, trust_points: config.trust_points.filter((_, i) => i !== index) })}
              className="text-left text-xs text-red-600 sm:col-span-2"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...config,
              trust_points: [
                ...config.trust_points,
                { id: crypto.randomUUID(), label_en: "", label_es: "" },
              ],
            })
          }
          className="text-sm text-amber-700"
        >
          Add trust point
        </button>
      </div>
    </SectionCard>
  );
}

function WhyUsSection({
  config,
  onChange,
}: {
  config: HomeServicesConfig;
  onChange: (next: HomeServicesConfig) => void;
}) {
  const updatePoint = (index: number, patch: Partial<HomeServicesWhyUsPoint>) => {
    const next = config.why_us_points.map((point, i) => (i === index ? { ...point, ...patch } : point));
    onChange({ ...config, why_us_points: next });
  };

  return (
    <SectionCard title="Why choose us">
      <div className="space-y-3">
        {config.why_us_points.map((point, index) => (
          <div key={point.id} className="space-y-2 rounded-lg border border-gray-100 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <TextInput value={point.title_en} onChange={(title_en) => updatePoint(index, { title_en })} placeholder="Title (English)" />
              <TextInput value={point.title_es} onChange={(title_es) => updatePoint(index, { title_es })} placeholder="Title (Español)" />
            </div>
            <TextArea value={point.body_en || ""} onChange={(body_en) => updatePoint(index, { body_en })} placeholder="Body (English)" rows={2} />
            <TextArea value={point.body_es || ""} onChange={(body_es) => updatePoint(index, { body_es })} placeholder="Body (Español)" rows={2} />
            <button
              type="button"
              onClick={() => onChange({ ...config, why_us_points: config.why_us_points.filter((_, i) => i !== index) })}
              className="text-xs text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...config,
              why_us_points: [
                ...config.why_us_points,
                { id: crypto.randomUUID(), title_en: "", title_es: "" },
              ],
            })
          }
          className="text-sm text-amber-700"
        >
          Add point
        </button>
      </div>
    </SectionCard>
  );
}

function CoverageSection({
  config,
  onChange,
}: {
  config: HomeServicesConfig;
  onChange: (next: HomeServicesConfig) => void;
}) {
  return (
    <SectionCard title="Service area coverage">
      <div className="space-y-3">
        <div>
          <FieldLabel>Coverage summary (English)</FieldLabel>
          <TextArea
            value={config.coverage_summary_en}
            onChange={(coverage_summary_en) => onChange({ ...config, coverage_summary_en })}
            placeholder="e.g. Serving Austin, Round Rock, and nearby neighborhoods"
          />
        </div>
        <div>
          <FieldLabel>Coverage summary (Español)</FieldLabel>
          <TextArea
            value={config.coverage_summary_es}
            onChange={(coverage_summary_es) => onChange({ ...config, coverage_summary_es })}
            placeholder="e.g. Servimos Austin, Round Rock y vecindarios cercanos"
          />
        </div>
      </div>
    </SectionCard>
  );
}

/**
 * One display image per Recent Work project. Legacy before/after pairs still
 * render on the live site (the template prefers the pair), so uploading or
 * removing here also clears before_image/after_image — otherwise the old pair
 * would keep winning over the new upload.
 */
function ProjectImageControl({
  project,
  onChange,
}: {
  project: HomeServicesGalleryProject;
  onChange: (patch: Partial<HomeServicesGalleryProject>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const displayImage = project.image || project.before_image || project.after_image;

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("images", file);
      const res = await fetch("/api/upload-images", { method: "POST", body: fd });
      const data: unknown = await res.json().catch(() => ({}));
      const body = (data ?? {}) as { urls?: unknown; error?: unknown };
      const url = Array.isArray(body.urls) ? body.urls[0] : undefined;
      if (!res.ok || typeof url !== "string") {
        setError(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      onChange({ image: url, before_image: undefined, after_image: undefined });
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-start gap-3">
      {displayImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayImage} alt="" className="h-20 w-28 rounded-lg border border-gray-200 object-cover" />
      ) : (
        <div className="flex h-20 w-28 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
          No image
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-left font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : displayImage ? "Replace image" : "Upload image"}
        </button>
        {displayImage && (
          <button
            type="button"
            onClick={() => onChange({ image: undefined, before_image: undefined, after_image: undefined })}
            className="text-left text-xs text-red-600 hover:text-red-800"
          >
            Remove image
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePick}
      />
    </div>
  );
}

function GalleryProjectErrors({
  index,
  rowId,
  errors,
}: {
  index: number;
  rowId: string;
  errors: HomeServicesEditorError[];
}) {
  const prefix = `gallery_projects.${index}.`;
  return (
    <>
      {errors
        .filter((error) =>
          error.rowId ? error.rowId === rowId : error.field.startsWith(prefix),
        )
        .map((error, i) => (
          <p key={`${error.field}-${i}`} className="text-xs text-red-600">
            {error.reason}
          </p>
        ))}
    </>
  );
}

function GalleryProjectsSection({
  config,
  errors,
  onChange,
}: {
  config: HomeServicesConfig;
  errors: HomeServicesEditorError[];
  onChange: (
    next: HomeServicesConfig | ((current: HomeServicesConfig) => HomeServicesConfig),
  ) => void;
}) {
  const updateProject = (id: string, patch: Partial<HomeServicesGalleryProject>) => {
    onChange((current) => ({
      ...current,
      gallery_projects: current.gallery_projects.map((project) =>
        project.id === id ? { ...project, ...patch } : project,
      ),
    }));
  };

  return (
    <SectionCard title="Recent work">
      <div className="space-y-3">
        {config.gallery_projects.map((project, index) => (
          <div key={project.id} className="space-y-2 rounded-lg border border-gray-100 p-3">
            <ProjectImageControl
              project={project}
              onChange={(patch) => updateProject(project.id, patch)}
            />
            <GalleryProjectErrors index={index} rowId={project.id} errors={errors} />
            <div className="grid gap-2 sm:grid-cols-2">
              <TextInput value={project.caption_en || ""} onChange={(caption_en) => updateProject(project.id, { caption_en })} placeholder="Description (English)" />
              <TextInput value={project.caption_es || ""} onChange={(caption_es) => updateProject(project.id, { caption_es })} placeholder="Description (Español)" />
            </div>
            <TextInput value={project.service_name || ""} onChange={(service_name) => updateProject(project.id, { service_name })} placeholder="Service name (optional)" />
            <button
              type="button"
              onClick={() => onChange({ ...config, gallery_projects: config.gallery_projects.filter((_, i) => i !== index) })}
              className="text-xs text-red-600"
            >
              Remove project
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...config,
              gallery_projects: [...config.gallery_projects, { id: crypto.randomUUID() }],
            })
          }
          className="text-sm text-amber-700"
        >
          Add project
        </button>
      </div>
    </SectionCard>
  );
}

function MessageLinksSection({
  config,
  onChange,
}: {
  config: HomeServicesConfig;
  onChange: (next: HomeServicesConfig) => void;
}) {
  return (
    <SectionCard title="Message link destinations">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel>WhatsApp (E.164)</FieldLabel>
          <TextInput
            value={config.message_links.whatsapp_e164 || ""}
            onChange={(whatsapp_e164) =>
              onChange({
                ...config,
                message_links: { ...config.message_links, whatsapp_e164: whatsapp_e164 || undefined },
              })
            }
            placeholder="+15551234567"
          />
        </div>
        <div>
          <FieldLabel>SMS (E.164)</FieldLabel>
          <TextInput
            value={config.message_links.sms_e164 || ""}
            onChange={(sms_e164) =>
              onChange({
                ...config,
                message_links: { ...config.message_links, sms_e164: sms_e164 || undefined },
              })
            }
            placeholder="+15551234567"
          />
        </div>
      </div>
    </SectionCard>
  );
}

function SectionVisibilitySection({
  config,
  onChange,
}: {
  config: HomeServicesConfig;
  onChange: (next: HomeServicesConfig) => void;
}) {
  const toggles: Array<{ key: keyof HomeServicesConfig["sections"]; label: string }> = [
    { key: "show_trust", label: "Trust strip" },
    { key: "show_gallery", label: "Project gallery" },
    { key: "show_why_us", label: "Why choose us" },
    { key: "show_reviews", label: "Reviews" },
    { key: "show_service_areas", label: "Service areas" },
    { key: "show_estimate", label: "Estimate section" },
  ];

  const toggle = (key: keyof HomeServicesConfig["sections"]) => {
    const current = config.sections[key] !== false;
    onChange({
      ...config,
      sections: { ...config.sections, [key]: !current },
    });
  };

  return (
    <SectionCard title="Section visibility">
      <div className="flex flex-wrap gap-2">
        {toggles.map(({ key, label }) => {
          const enabled = config.sections[key] !== false;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                enabled
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {label}: {enabled ? "On" : "Off"}
            </button>
          );
        })}
      </div>
    </SectionCard>
  );
}

function HeroVideoSection({
  value,
  uploading,
  error,
  onUpload,
  onRemove,
}: {
  value: string | null;
  uploading: boolean;
  error: string | null;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <SectionCard title="Hero background video">
      {value ? (
        <div className="space-y-2">
          <p className="text-sm text-gray-600 break-all">{value}</p>
          <button type="button" onClick={onRemove} className="text-sm text-red-600 hover:text-red-800">
            Remove video
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No hero video uploaded.</p>
      )}
      <div className="mt-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
          {uploading ? "Uploading..." : "Upload MP4 or WebM"}
          <input type="file" accept="video/mp4,video/webm" className="hidden" onChange={onUpload} disabled={uploading} />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-1 text-xs text-gray-400">Max 20MB. Replaces the first gallery image as hero background when set.</p>
      </div>
    </SectionCard>
  );
}

function buildPreviewData(preview: Record<string, unknown>, draft: EditorDraft): PreviewData {
  const existingCopy = (preview.generated_copy || {}) as Record<string, unknown>;
  const base = preview as unknown as PreviewData;
  return {
    ...base,
    business_name: draft.business_name,
    phone: draft.phone,
    color_theme: draft.color_theme,
    services: draft.services.filter((service) => service.name.trim()),
    images: draft.images,
    hero_video_url: draft.hero_video_url,
    gallery_video_url: draft.gallery_video_url,
    gallery_video_title: draft.gallery_video_title || null,
    generated_copy: {
      ...(existingCopy as unknown as PreviewData["generated_copy"]),
      en: draft.generated_copy.en,
      es: draft.generated_copy.es,
      home_services_config: draft.home_services_config,
      ...({
        section_settings: {
          ...draft.generated_copy.section_settings,
          about_image_url: draft.about_image_url,
        },
      } as Record<string, unknown>),
    } as PreviewData["generated_copy"],
  };
}

export function HomeServicesSiteEditor({ tenant, preview }: SiteEditorProps) {
  const slug = preview.slug as string;
  const tenantId = typeof tenant.id === "string" ? tenant.id : "";
  const [draft, setDraft] = useState<EditorDraft>(() => buildDraft(preview));
  const [contentLocale, setContentLocale] = useState<HomeServicesLocale>("en");
  const [previewLocale, setPreviewLocale] = useState<HomeServicesLocale>("en");
  const [activeTab, setActiveTab] = useState<"edit" | "preview">("edit");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [configErrors, setConfigErrors] = useState<HomeServicesEditorError[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [twilioWarning, setTwilioWarning] = useState<string | null>(null);
  const [channelWarnings, setChannelWarnings] = useState<{
    sms: string | null;
    whatsapp: string | null;
  }>({ sms: null, whatsapp: null });

  useEffect(() => {
    if (!tenantId) return;
    void fetch(`/api/admin/estimate-requests/list?tenantId=${encodeURIComponent(tenantId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!body) return;
        setTwilioWarning(typeof body.twilioWarning === "string" ? body.twilioWarning : null);
        const warnings = body.channelWarnings;
        if (warnings && typeof warnings === "object") {
          setChannelWarnings({
            sms: typeof warnings.sms === "string" ? warnings.sms : null,
            whatsapp: typeof warnings.whatsapp === "string" ? warnings.whatsapp : null,
          });
        }
      })
      .catch(() => {});
  }, [tenantId]);

  const updateConfig = (
    next: HomeServicesConfig | ((current: HomeServicesConfig) => HomeServicesConfig),
  ) => {
    setDraft((current) => ({
      ...current,
      home_services_config:
        typeof next === "function" ? next(current.home_services_config) : next,
    }));
  };

  const patchServiceImage = (clientId: string, image: string | undefined) => {
    if (!clientId) return;
    setDraft((current) => ({
      ...current,
      services: current.services.map((service) =>
        service.client_id === clientId ? { ...service, image } : service,
      ),
    }));
  };

  const updateNotification = (patch: {
    channel?: EstimateDeliveryChannel;
    destination_e164?: string;
    sms_fallback_e164?: string;
  }) => {
    const current = draft.home_services_config.notification ?? {
      channel: "sms" as const,
      destination_e164: "",
    };
    const next = {
      ...current,
      ...patch,
    };
    if (patch.channel === "sms") {
      const withoutFallback = { ...next };
      delete (withoutFallback as { sms_fallback_e164?: string }).sms_fallback_e164;
      updateConfig({
        ...draft.home_services_config,
        notification: withoutFallback,
      });
      return;
    }
    updateConfig({
      ...draft.home_services_config,
      notification: next,
    });
  };

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const validation = validateHomeServicesEditorConfig(draft.home_services_config);
    if (!validation.ok) {
      setConfigErrors(validation.errors);
      setError("Fix the highlighted home-services content before saving.");
      return;
    }
    setConfigErrors([]);
    setSaving(true);

    try {
      const res = await fetch("/api/update-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          updates: {
            business_name: draft.business_name,
            phone: draft.phone,
            color_theme: draft.color_theme,
            services: draft.services.filter((service) => service.name.trim()),
            images: draft.images,
            hero_video_url: draft.hero_video_url,
            gallery_video_url: draft.gallery_video_url,
            gallery_video_title: draft.gallery_video_title || null,
            generated_copy: {
              en: draft.generated_copy.en,
              es: draft.generated_copy.es,
              section_settings: {
                ...draft.generated_copy.section_settings,
                about_image_url: draft.about_image_url,
              },
              home_services_config: draft.home_services_config,
            },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Failed to save");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const MAX_VIDEO_SIZE = 20 * 1024 * 1024;

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVideoError(null);

    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setVideoError("Use MP4 or WebM.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_VIDEO_SIZE) {
      setVideoError(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max 20MB.`);
      e.target.value = "";
      return;
    }

    setUploadingVideo(true);
    try {
      const signRes = await fetch("/api/upload-hero-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: file.type, size: file.size }),
      });
      if (!signRes.ok) {
        const body = await signRes.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to prepare upload");
      }
      const { path, token, publicUrl } = await signRes.json();
      const client = createBrowserSupabase();
      const { error: uploadError } = await client.storage
        .from("preview-images")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      setDraft((current) => ({ ...current, hero_video_url: publicUrl }));
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideo(false);
      e.target.value = "";
    }
  };

  const previewData = buildPreviewData(preview, draft);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Edit Home Services Site — {tenant.business_name as string}
          </h1>
          {typeof tenant.subdomain === "string" && tenant.subdomain && (
            <p className="mt-1 text-sm text-gray-400">{tenant.subdomain}.siteforowners.com</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm font-medium text-green-600">Saved!</span>}
          {error && <span className="text-sm font-medium text-red-600">{error}</span>}
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b">
        {(["edit", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              activeTab === tab
                ? "border-b-2 border-amber-500 text-amber-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab === "edit" ? "Edit" : "Live Preview"}
          </button>
        ))}
      </div>

      {activeTab === "edit" ? (
        <div className="space-y-6">
          <BusinessBasicsSection draft={draft} onChange={setDraft} />
          <ThemeSection draft={draft} onChange={setDraft} />

          <div className="flex gap-2">
            {(["en", "es"] as const).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => setContentLocale(locale)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  contentLocale === locale
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {locale === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>

          <LocaleCopySection draft={draft} locale={contentLocale} onChange={setDraft} />
          <ServicesSection
            draft={draft}
            contentLocale={contentLocale}
            tenantId={tenantId}
            onChange={setDraft}
            onImageChange={patchServiceImage}
          />
          <TrustPointsSection config={draft.home_services_config} onChange={updateConfig} />
          <WhyUsSection config={draft.home_services_config} onChange={updateConfig} />
          <CoverageSection config={draft.home_services_config} onChange={updateConfig} />
          <HomeServicesContentEditor config={draft.home_services_config} rowErrors={configErrors} onChange={updateConfig} />
          <GalleryProjectsSection
            config={draft.home_services_config}
            errors={configErrors}
            onChange={updateConfig}
          />
          <MessageLinksSection config={draft.home_services_config} onChange={updateConfig} />
          <NotificationSettingsSection
            channel={draft.home_services_config.notification?.channel ?? "sms"}
            destinationE164={draft.home_services_config.notification?.destination_e164 ?? ""}
            smsFallbackE164={draft.home_services_config.notification?.sms_fallback_e164 ?? ""}
            twilioWarning={
              twilioWarning
              ?? channelWarnings[draft.home_services_config.notification?.channel ?? "sms"]
            }
            onChange={updateNotification}
          />
          <SectionVisibilitySection config={draft.home_services_config} onChange={updateConfig} />

          <GalleryEditor
            images={draft.images}
            onChange={(images) => setDraft((current) => ({ ...current, images }))}
            variant="founder"
            enableHeroPromotion
            heading="Gallery photos"
          />

          <GalleryVideoEditor
            value={draft.gallery_video_url}
            title={draft.gallery_video_title}
            onChange={(gallery_video_url) => setDraft((current) => ({ ...current, gallery_video_url }))}
            onTitleChange={(gallery_video_title) => setDraft((current) => ({ ...current, gallery_video_title }))}
            variant="founder"
            tenantId={typeof tenant.id === "string" ? tenant.id : undefined}
          />

          <AboutImagePicker
            value={draft.about_image_url}
            gallery={draft.images}
            onChange={(about_image_url) => setDraft((current) => ({ ...current, about_image_url }))}
            variant="founder"
          />

          <HeroVideoSection
            value={draft.hero_video_url}
            uploading={uploadingVideo}
            error={videoError}
            onUpload={handleVideoUpload}
            onRemove={() => {
              setDraft((current) => ({ ...current, hero_video_url: null }));
              setVideoError(null);
            }}
          />

          {tenantId && <EstimateDeliveryDiagnostics tenantId={tenantId} />}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white shadow-lg">
          <div className="flex gap-2 border-b bg-gray-50 px-4 py-2">
            {(["en", "es"] as const).map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => setPreviewLocale(locale)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  previewLocale === locale
                    ? "bg-amber-100 text-amber-800"
                    : "bg-white text-gray-600"
                }`}
              >
                {locale === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
          <TemplateRouter data={previewData} locale={previewLocale} />
        </div>
      )}
    </div>
  );
}

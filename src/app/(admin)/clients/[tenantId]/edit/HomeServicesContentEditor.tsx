"use client";

import { useState } from "react";
import type {
  HomeServicesConfig,
  HomeServicesSectionKey,
} from "@/lib/home-services/types";
import {
  parseZipInput,
  type HomeServicesEditorError,
} from "@/lib/home-services/editor-validation";

type Props = {
  config: HomeServicesConfig;
  rowErrors: HomeServicesEditorError[];
  onChange: (value: HomeServicesConfig) => void;
};
const sectionKeys: HomeServicesSectionKey[] = [
  "services",
  "recent_work",
  "process",
  "reviews",
  "service_areas",
  "final_cta",
];
const inputClass = "min-h-11 w-full rounded-lg border px-3 py-2 text-sm";

function Errors({
  prefix,
  rowId,
  errors,
}: {
  prefix: string;
  rowId: string;
  errors: HomeServicesEditorError[];
}) {
  return (
    <>
      {errors
        .filter((error) =>
          error.rowId ? error.rowId === rowId : error.field.startsWith(prefix),
        )
        .map((error, index) => (
          <p
            key={`${error.field}-${index}`}
            className="mt-1 text-sm text-red-600"
          >
            {error.reason}
          </p>
        ))}
    </>
  );
}

export function HomeServicesContentEditor({
  config,
  rowErrors,
  onChange,
}: Props) {
  const [zipDrafts, setZipDrafts] = useState<Record<string, string>>({});
  const move = <T,>(rows: T[], index: number, direction: -1 | 1): T[] => {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return rows;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };
  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Bilingual section copy</h2>
        <div className="space-y-4">
          {sectionKeys.map((key) => {
            const copy = config.section_copy[key] ?? {};
            return (
              <fieldset key={key} className="rounded-lg border p-4">
                <legend className="px-1 font-medium capitalize">
                  {key.replaceAll("_", " ")}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["eyebrow", "title", "intro"] as const).flatMap((field) =>
                    (["en", "es"] as const).map((locale) => {
                      const prop = `${field}_${locale}` as const;
                      return (
                        <label key={prop} className="text-sm">
                          {field} ({locale === "en" ? "English" : "Español"})
                          <input
                            className={inputClass}
                            value={copy[prop] ?? ""}
                            onChange={(event) =>
                              onChange({
                                ...config,
                                section_copy: {
                                  ...config.section_copy,
                                  [key]: {
                                    ...copy,
                                    [prop]: event.target.value,
                                  },
                                },
                              })
                            }
                          />
                        </label>
                      );
                    }),
                  )}
                </div>
              </fieldset>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Process steps</h2>
          <button
            type="button"
            className="min-h-11 px-3"
            onClick={() =>
              onChange({
                ...config,
                process_steps: [
                  ...config.process_steps,
                  {
                    id: crypto.randomUUID(),
                    title_en: "",
                    body_en: "",
                    title_es: "",
                    body_es: "",
                  },
                ],
              })
            }
            disabled={config.process_steps.length >= 3}
          >
            Add process step
          </button>
        </div>
        <label className="mb-4 flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={config.sections.show_process !== false}
            onChange={(event) =>
              onChange({
                ...config,
                sections: {
                  ...config.sections,
                  show_process: event.target.checked,
                },
              })
            }
          />
          Show process
        </label>
        {config.process_steps.map((row, index) => (
          <div key={row.id} className="mb-3 rounded-lg border p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {(["title_en", "title_es", "body_en", "body_es"] as const).map(
                (field) => (
                  <label key={field} className="text-sm">
                    {field
                      .replace("_en", " (English)")
                      .replace("_es", " (Español)")}
                    <input
                      className={inputClass}
                      value={row[field]}
                      onChange={(event) =>
                        onChange({
                          ...config,
                          process_steps: config.process_steps.map((item, i) =>
                            i === index
                              ? { ...item, [field]: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <Errors
              prefix={`process_steps.${index}`}
              rowId={row.id}
              errors={rowErrors}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="min-h-11 px-3"
                type="button"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...config,
                    process_steps: move(config.process_steps, index, -1),
                  })
                }
              >
                Up
              </button>
              <button
                className="min-h-11 px-3"
                type="button"
                disabled={index === config.process_steps.length - 1}
                onClick={() =>
                  onChange({
                    ...config,
                    process_steps: move(config.process_steps, index, 1),
                  })
                }
              >
                Down
              </button>
              <button
                className="min-h-11 px-3 text-red-600"
                type="button"
                onClick={() =>
                  onChange({
                    ...config,
                    process_steps: config.process_steps.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Service areas</h2>
          <button
            type="button"
            className="min-h-11 px-3"
            disabled={config.service_areas.length >= 20}
            onClick={() =>
              onChange({
                ...config,
                service_areas: [
                  ...config.service_areas,
                  { id: crypto.randomUUID(), name: "", zip_codes: [] },
                ],
              })
            }
          >
            Add service area
          </button>
        </div>
        {config.service_areas.map((row, index) => (
          <div key={row.id} className="mb-3 rounded-lg border p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Area name
                <input
                  className={inputClass}
                  value={row.name}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      service_areas: config.service_areas.map((item, i) =>
                        i === index
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                ZIP codes (comma or line separated)
                <textarea
                  className={inputClass}
                  value={zipDrafts[row.id] ?? row.zip_codes.join(", ")}
                  onInput={(event) =>
                    setZipDrafts((current) => ({
                      ...current,
                      [row.id]: event.currentTarget.value,
                    }))
                  }
                  onBlur={(event) =>
                    onChange({
                      ...config,
                      service_areas: config.service_areas.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              zip_codes: parseZipInput(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Note (English)
                <input
                  className={inputClass}
                  value={row.note_en ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      service_areas: config.service_areas.map((item, i) =>
                        i === index
                          ? { ...item, note_en: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Note (Español)
                <input
                  className={inputClass}
                  value={row.note_es ?? ""}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      service_areas: config.service_areas.map((item, i) =>
                        i === index
                          ? { ...item, note_es: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
              </label>
            </div>
            <Errors
              prefix={`service_areas.${index}`}
              rowId={row.id}
              errors={rowErrors}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="min-h-11 px-3"
                type="button"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...config,
                    service_areas: move(config.service_areas, index, -1),
                  })
                }
              >
                Up
              </button>
              <button
                className="min-h-11 px-3"
                type="button"
                disabled={index === config.service_areas.length - 1}
                onClick={() =>
                  onChange({
                    ...config,
                    service_areas: move(config.service_areas, index, 1),
                  })
                }
              >
                Down
              </button>
              <button
                className="min-h-11 px-3 text-red-600"
                type="button"
                onClick={() =>
                  onChange({
                    ...config,
                    service_areas: config.service_areas.filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

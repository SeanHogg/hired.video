/**
 * TemplateStartPanel — the studio home's third start, "Or start from a
 * template", beside the kit drop zone and "Or start with one": a few use-for
 * tabs and six template thumbnails; a click starts a project from it (the
 * page's shared `create`), "See all" jumps to the full Templates section.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import { TEMPLATE_STARTS, templatesForStart } from "@/lib/studio/landing/template-starts";
import { useTemplateActions } from "@/lib/studio/landing/use-template-actions";
import type { CreateStudioDraft } from "@/lib/studio/landing/types";
import { cn } from "@/lib/utils";
import { templateLabel } from "@/lib/studio/templates/template-text";

export default function TemplateStartPanel({ create }: { create: CreateStudioDraft }) {
  const { t } = useTranslation();
  const { openTemplate } = useTemplateActions(create);
  const [startId, setStartId] = useState(TEMPLATE_STARTS[0].id);
  const templates = templatesForStart(startId);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {t("studio.landing.templateStart.heading")}
        </h3>
        <a href="#templates" className="text-xs font-semibold text-primary hover:underline">
          {t("studio.landing.templateStart.seeAll")}
        </a>
      </div>
      <div role="group" aria-label={t("studio.landing.templateStart.filterAria")} className="flex flex-wrap gap-1.5">
        {TEMPLATE_STARTS.map((start) => (
          <button
            key={start.id}
            type="button"
            aria-pressed={startId === start.id}
            onClick={() => setStartId(start.id)}
            className={cn(
              "min-h-8 rounded-full border px-3 text-xs font-semibold",
              startId === start.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t(start.labelKey)}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
        {templates.map((template) => (
          <li key={template.id} className="min-w-0">
            <button
              type="button"
              onClick={() => openTemplate(template.id)}
              aria-label={t("labels.studioLanding.useTemplateAria", { name: templateLabel(template, t) })}
              className="group flex w-full flex-col gap-1.5 text-left"
            >
              <TemplateThumb
                template={template}
                className="rounded-lg border border-border transition group-hover:border-brand-primary group-hover:shadow-md"
              />
              <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground">{templateLabel(template, t)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

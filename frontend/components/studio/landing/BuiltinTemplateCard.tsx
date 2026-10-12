import { useTranslation } from "react-i18next";
import { Eye, Pencil } from "lucide-react";
import type { ContentTemplate, TemplateDef } from "@/lib/studio/templates/catalog";
import TemplateThumb from "@/components/studio/templates/TemplateThumb";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import { isGetHiredTemplate } from "@/lib/studio/career-starts";
import { templateDesc, templateLabel } from "@/lib/studio/templates/template-text";

export default function BuiltinTemplateCard({
  template,
  onPick,
  onPreview,
}: {
  template: TemplateDef;
  onPick: (id: string) => void;
  onPreview: (id: ContentTemplate) => void;
}) {
  const { t } = useTranslation();
  const Icon = template.icon;
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-primary hover:shadow-md">
      {/* Card body: clicking starts a new project from this template
          (the primary action on /studio). Wrapped in its own button so
          it doesn't nest with the Preview pill below. */}
      <button
        type="button"
        onClick={() => onPick(template.id)}
        className="flex flex-1 flex-col text-left"
        aria-label={t("labels.studioLanding.useTemplateAria", { name: templateLabel(template, t) })}
      >
        <div className="relative">
          <TemplateThumb template={template} />
          {/* Hover label confirms the click action. The Preview pill is
              rendered as a sibling button outside this one so click
              events route to the right handler. */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              {t("actions.use")}
            </span>
          </div>
          {/* Kind badge — bottom-left, always visible, self-hides for
              `mediaKind === "video"` so the existing video-only catalog
              doesn't gain redundant "Video" chips. */}
          <MediaKindBadge
            mediaKind={template.mediaKind}
            documentKind={template.documentEntityKind}
            className="absolute bottom-2 left-2 z-10"
          />
        </div>
        <div className="flex items-start gap-2 p-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {templateLabel(template, t)}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {templateDesc(template, t)}
            </p>
            <span
              className={
                isGetHiredTemplate(template.id)
                  ? "mt-1.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary"
                  : "mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
              }
            >
              {t(isGetHiredTemplate(template.id) ? "studio.newMenu.tag.getHired" : "studio.newMenu.tag.moreFormats")}
            </span>
          </div>
        </div>
      </button>
      {/* Preview pill — opens /marketplace/templates/<slug>, the same
          SEO surface the homepage + search results link to. Positioned
          absolutely so it sits over the thumb without nesting inside
          the Use button. */}
      <button
        type="button"
        onClick={() => onPreview(template.id)}
        aria-label={t("labels.studioLanding.previewTemplateAria", { name: templateLabel(template, t) })}
        className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-md backdrop-blur transition hover:bg-card group-hover:flex group-focus-within:flex"
      >
        <Eye className="h-3.5 w-3.5" />
        {t("actions.preview")}
      </button>
    </div>
  );
}

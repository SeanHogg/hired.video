import { useTranslation } from "react-i18next";
import { Eye, Pencil, Sparkles } from "lucide-react";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import type { StudioTemplate } from "@/lib/services/studio-templates-service";
import type { OwnedTemplate } from "@/lib/studio/landing/types";
import { cn } from "@/lib/utils";
import { provenanceBadge } from "./provenance-badge";

/**
 * Self-contained card for a template the user owns — used inside the
 * Mine-mode carousel AND the dedicated "Your templates" grid below the
 * built-ins. Renders the row's thumbnail image (or a fallback marquee
 * for templates that don't have one yet) plus a provenance badge so the
 * user can tell their published rows from their purchased/claimed ones
 * at a glance. Self-gates the Preview pill: only public/unlisted rows
 * have a listing page, so private drafts render the card without it.
 */
export default function OwnedTemplateCard({
  owned,
  onPick,
  onPreview,
}: {
  owned: OwnedTemplate;
  onPick: (template: StudioTemplate) => void;
  onPreview: (template: StudioTemplate) => void;
}) {
  const { t } = useTranslation();
  const { template, provenance } = owned;
  const badge = provenanceBadge(t)[provenance];
  const canPreview = template.visibility !== "private";
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-brand-primary hover:shadow-md">
      <button
        type="button"
        onClick={() => onPick(template)}
        className="flex flex-1 flex-col text-left"
        aria-label={t("labels.studioLanding.useTemplateAria", { name: template.name })}
      >
        <div className="relative aspect-video w-full overflow-hidden bg-muted">
          {template.thumbnailUrl ? (
            <img
              src={template.thumbnailUrl}
              alt={template.name}
              className="h-full w-full object-cover"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-primary-foreground bg-primary">
              <Sparkles className="h-6 w-6 opacity-80" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-md">
              <Pencil className="h-3.5 w-3.5" />
              {t("actions.use")}
            </span>
          </div>
          {/* Kind badge — bottom-left, symmetric with BuiltinTemplateCard.
              Reads `template.mediaKind` post-#913; pre-#913 rows
              default to 'video' via the zod schema default so this is
              safe for legacy templates too. Self-hides for video. */}
          <MediaKindBadge
            mediaKind={template.mediaKind}
            documentKind={template.documentKind}
            className="absolute bottom-2 left-2 z-10"
          />
        </div>
        <div className="flex items-start gap-2 p-3">
          <div className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            badge.iconClassName,
          )}>
            <badge.Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium leading-tight">
              {template.name}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {template.description?.trim() || badge.fallbackBlurb}
            </p>
          </div>
        </div>
      </button>
      {/* Provenance badge — always visible so users can scan the grid
          and tell their own published rows from purchased/claimed ones
          without hovering. */}
      <span
        className={cn(
          "pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur",
          badge.pillClassName,
        )}
      >
        <badge.Icon className="h-3 w-3" />
        {badge.label}
      </span>
      {canPreview && (
        <button
          type="button"
          onClick={() => onPreview(template)}
          aria-label={t("labels.studioLanding.previewTemplateAria", { name: template.name })}
          className="absolute right-2 top-2 z-10 hidden items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-md backdrop-blur transition hover:bg-card group-hover:flex group-focus-within:flex"
        >
          <Eye className="h-3.5 w-3.5" />
          {t("actions.preview")}
        </button>
      )}
    </div>
  );
}

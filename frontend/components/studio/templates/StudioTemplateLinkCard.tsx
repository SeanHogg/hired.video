// Marketing-page card for a studio template.
//
// Self-gating link to the per-template landing page (#901). Used by both
// /for/:audience (#900) and /templates/:slug (#901 related grid). Per the
// DRY rule, a single card primitive serves every marketing grid — the
// StudioLanding chooser's `BuiltinTemplateCard` is intentionally distinct
// because it's an in-app pick-to-create action, not a marketing link.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import type { TemplateDef } from "@/lib/studio/templates/catalog";
import { OutputProfilePanel } from "./OutputProfilePanel";
import TemplateThumb from "./TemplateThumb";
import MediaKindBadge from "@/components/studio/shared/MediaKindBadge";
import { templateDesc, templateLabel } from "@/lib/studio/templates/template-text";

export interface StudioTemplateLinkCardProps {
  template: TemplateDef;
}

export function StudioTemplateLinkCard({ template }: StudioTemplateLinkCardProps): JSX.Element {
  const { t } = useTranslation();
  const Icon = template.icon;
  return (
    <Link
      to={`/templates/${template.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition hover:border-brand-primary hover:shadow-md"
    >
      <div className="relative">
        <TemplateThumb template={template} />
        <MediaKindBadge
          mediaKind={template.mediaKind}
          documentKind={template.documentEntityKind}
          className="absolute bottom-2 left-2 z-10"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">{templateLabel(template, t)}</p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{templateDesc(template, t)}</p>
          </div>
        </div>
        <div className="mt-auto flex items-end justify-between pt-2">
          <OutputProfilePanel mediaKind={template.mediaKind} variant="inline" />
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </Link>
  );
}

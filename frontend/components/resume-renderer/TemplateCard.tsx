// Card cell rendered by the search/marketplace grid. Now generic over any
// TemplateMeta — used to be resume-only, but the unified registry means the
// same card surfaces resume + studio-builtin + studio-creator templates.
//
// Self-gates everything via TemplateApplyButton (cart vs. claim vs. use)
// and TemplateInfoButton (route vs. sheet); the card itself doesn't branch
// on kind.

import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplateInfoButton from "@/components/templates/TemplateInfoButton";
import TemplatePreview from "@/components/templates/TemplatePreview";
import FirstPartyBadge from "@/components/templates/FirstPartyBadge";
import { priceLabel } from "@/lib/templates/use-apply-template";
import { getStaticTemplateBySlug } from "@/lib/templates/registry";
import type { TemplateMeta } from "@/lib/templates/types";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface TemplateCardProps {
  /** Preferred input — fully-resolved meta. */
  meta?: TemplateMeta;
  /** Back-compat for callers still passing a raw resume descriptor; the card
   *  internally adapts to TemplateMeta so all downstream behaviour matches. */
  descriptor?: ResumeTemplateDescriptor;
}

export default function TemplateCard({ meta, descriptor }: TemplateCardProps) {
  const navigate = useNavigate();
  const resolved = meta ?? (descriptor ? getStaticTemplateBySlug(descriptor.id) : null);
  if (!resolved) return null;
  const isFree = resolved.priceCents <= 0;

  const openPreview = () => navigate(`/marketplace/templates/${resolved.slug}`);

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      {/* Thumbnail — kind-aware via TemplatePreview. The compact flag scales
          resume documents to a card-sized preview and tells video previews
          to render uncontrolled. */}
      <button
        type="button"
        onClick={openPreview}
        aria-label={`Preview ${resolved.name}`}
        className="relative w-full h-72 overflow-hidden bg-muted/30 border-b block"
      >
        {resolved.kind === "resume" ? (
          <div className="absolute inset-0 flex items-start justify-center pointer-events-none">
            <div
              className="origin-top"
              style={{
                transform: "scale(0.32)",
                transformOrigin: "top center",
                width: "900px",
              }}
            >
              <TemplatePreview meta={resolved} compact />
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            <TemplatePreview meta={resolved} compact />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-3">
          <Badge variant="secondary" className="shadow">
            <Eye className="w-3 h-3 mr-1" />Preview
          </Badge>
        </div>
      </button>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold leading-tight truncate">{resolved.name}</h3>
              {/* Self-gates: renders nothing for non-first-party templates. */}
              <FirstPartyBadge meta={resolved} />
            </div>
            {resolved.industry && (
              <p className="text-xs text-muted-foreground mt-0.5">{resolved.industry}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <TemplateInfoButton meta={resolved} className="h-7 w-7" />
            <Badge variant={isFree ? "secondary" : "default"}>
              {priceLabel(resolved.priceCents)}
            </Badge>
          </div>
        </div>

        {resolved.blurb && (
          <p className="text-sm text-muted-foreground line-clamp-2">{resolved.blurb}</p>
        )}

        <div className="flex gap-2 mt-auto">
          <Button variant="outline" size="sm" className="flex-1" onClick={openPreview}>
            <Eye className="w-4 h-4 mr-1" />Preview
          </Button>
          <TemplateApplyButton meta={resolved} size="sm" className="flex-1" />
        </div>
      </div>
    </div>
  );
}

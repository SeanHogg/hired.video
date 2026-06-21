// Card cell rendered by the search/marketplace grid. Now generic over any
// TemplateMeta — used to be resume-only, but the unified registry means the
// same card surfaces resume + studio-builtin + studio-creator templates.
//
// Self-gates everything via TemplateApplyButton (cart vs. claim vs. use)
// and TemplateInfoButton (route vs. sheet); the card itself doesn't branch
// on kind. Share affordance routes through the platform-wide
// `buildShareAction` helper so the copy-link + toast UX is identical to
// every other entity card.
//
// Two orientations share one implementation (DRY):
//   "column" (default) — preview on top, details below; the marketplace grid.
//   "row"              — details on the LEFT, preview on the RIGHT; used by the
//                        homepage "Start from a Template" strip so visitors read
//                        the design *type* first, then glance at the preview.

import { Link, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import BaseCard from "@/components/ui/BaseCard";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplateInfoButton from "@/components/templates/TemplateInfoButton";
import TemplatePreview from "@/components/templates/TemplatePreview";
import FirstPartyBadge from "@/components/templates/FirstPartyBadge";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import { priceLabel } from "@/lib/templates/use-apply-template";
import { getStaticTemplateBySlug } from "@/lib/templates/registry";
import { buildShareAction } from "@/lib/card-share-action";
import type { TemplateMeta } from "@/lib/templates/types";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface TemplateCardProps {
  /** Preferred input — fully-resolved meta. */
  meta?: TemplateMeta;
  /** Back-compat for callers still passing a raw resume descriptor; the card
   *  internally adapts to TemplateMeta so all downstream behaviour matches. */
  descriptor?: ResumeTemplateDescriptor;
  /** Card axis. Defaults to the vertical marketplace card. "row" puts the
   *  preview on the right and the details on the left. */
  orientation?: "column" | "row";
  /** Label for the primary CTA on the free "use"/"claim" path (e.g.
   *  "Get started"). Falls through to the computed label otherwise. */
  primaryCtaLabel?: string;
}

export default function TemplateCard({
  meta,
  descriptor,
  orientation = "column",
  primaryCtaLabel,
}: TemplateCardProps) {
  const navigate = useNavigate();
  const resolved = meta ?? (descriptor ? getStaticTemplateBySlug(descriptor.id) : null);
  if (!resolved) return null;
  const isFree = resolved.priceCents <= 0;
  const isRow = orientation === "row";

  const shareAction = buildShareAction({
    entityUrl: `/marketplace/templates/${resolved.slug}`,
    copySuccessDescription: "Template link has been copied to your clipboard.",
  });

  const openPreview = () => navigate(`/marketplace/templates/${resolved.slug}`);

  // Clickable preview surface — kind-aware via TemplatePreview. The compact flag
  // scales resume documents to a card-sized preview and tells video previews to
  // render uncontrolled. Shared by both orientations; the wrapper controls size.
  const previewButton = (
    <button
      type="button"
      onClick={openPreview}
      aria-label={`Preview ${resolved.name}`}
      className={cn(
        "group relative overflow-hidden bg-muted/30 block",
        isRow ? "w-2/5 shrink-0 self-stretch border-l" : "w-full h-72 border-b",
      )}
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
  );

  const details = (
    <div className={cn("flex flex-col gap-3 flex-1", isRow ? "p-5" : "p-4")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={cn(
                "font-semibold leading-tight truncate",
                isRow && "text-lg",
              )}
            >
              <Link
                to={`/marketplace/templates/${resolved.slug}`}
                className="hover:text-primary transition-colors hover:underline underline-offset-2"
              >
                {resolved.name}
              </Link>
            </h3>
            {/* Self-gates: renders nothing for non-first-party templates. */}
            <FirstPartyBadge meta={resolved} />
          </div>
          {resolved.industry && (
            <p className="text-xs text-muted-foreground mt-0.5">{resolved.industry}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TemplateInfoButton meta={resolved} className="h-7 w-7" />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label="Share template"
            onClick={(e) => {
              e.stopPropagation();
              shareAction.onClick(e);
            }}
          >
            <Share2 className="w-4 h-4" />
          </Button>
          {/* Report Abuse — only creator-authored templates carry a
              backend uuid + owner to moderate (resume + studio-builtin
              templates are platform content). Self-gates: hidden for the
              creator, bounces anonymous viewers to /login. Mirrors the
              MarketplaceTemplatePreview wiring. */}
          {resolved.origin.kind === "studio-creator" && (
            <ReportAbuseButton
              entityType="studio_template"
              entityId={resolved.origin.template.id}
              entityOwnerId={resolved.origin.template.creatorId ?? undefined}
              entityLabel="studio template"
              triggerVariant="ghost"
            />
          )}
          <Badge variant={isFree ? "secondary" : "default"}>
            {priceLabel(resolved.priceCents)}
          </Badge>
        </div>
      </div>

      {resolved.blurb && (
        <p className={cn("text-sm text-muted-foreground", isRow ? "line-clamp-3" : "line-clamp-2")}>
          {resolved.blurb}
        </p>
      )}

      <div className="flex gap-2 mt-auto">
        <Button variant="outline" size="sm" className="flex-1" onClick={openPreview}>
          <Eye className="w-4 h-4 mr-1" />Preview
        </Button>
        <TemplateApplyButton
          meta={resolved}
          size="sm"
          className="flex-1"
          labelOverride={primaryCtaLabel}
          withArrow={Boolean(primaryCtaLabel)}
        />
      </div>
    </div>
  );

  return (
    <BaseCard className={cn("overflow-hidden rounded-xl", isRow ? "flex flex-row" : "flex flex-col")}>
      {isRow ? (
        <>
          {details}
          {previewButton}
        </>
      ) : (
        <>
          {previewButton}
          {details}
        </>
      )}
    </BaseCard>
  );
}

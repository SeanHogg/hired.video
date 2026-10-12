// Template card — generic over any TemplateMeta (resume, studio-builtin,
// studio-creator). Used by /templates, the search/marketplace feed, and the
// home/resume-templates gallery.
//
// Anatomy (TemplateThumb mockup): thumbnail in a muted well (links to the
// /marketplace/templates/:slug detail page) → name + industry → footer with
// the FREE / price + kind + hired.video chips on the left and the self-gating
// "Use" button (TemplateApplyButton: cart vs. claim vs. use) on the right.
// Share is the reusable <ShareMenu>; creator templates keep Report Abuse.

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import TemplateCardThumb from "@/components/templates/TemplateCardThumb";
import FirstPartyBadge from "@/components/templates/FirstPartyBadge";
import TemplateKindChip from "@/components/templates/TemplateKindChip";
import { PriceChip } from "@/components/templates/MonoChip";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import ShareMenu from "@/components/share/ShareMenu";
import { getStaticTemplateBySlug } from "@/lib/templates/registry";
import { isResumeTemplate, templateMetaKind, type TemplateMeta } from "@/lib/templates/types";
import type { ResumeTemplateDescriptor } from "@/types/resume-template";

interface TemplateCardProps {
  /** Preferred input — fully-resolved meta. */
  meta?: TemplateMeta;
  /** Back-compat for callers still passing a raw resume descriptor; the card
   *  internally adapts to TemplateMeta so all downstream behaviour matches. */
  descriptor?: ResumeTemplateDescriptor;
}

export default function TemplateCard({ meta, descriptor }: TemplateCardProps) {
  const { t } = useTranslation();
  const resolved = meta ?? (descriptor ? getStaticTemplateBySlug(descriptor.id) : null);
  if (!resolved) return null;

  const isResume = isResumeTemplate(resolved);
  const detailPath = `/marketplace/templates/${encodeURIComponent(resolved.slug)}`;
  const shareUrl = `${window.location.origin}${detailPath}`;
  const subline = resolved.industry || resolved.blurb;

  return (
    <article className="flex h-full flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5">
      <Link
        to={detailPath}
        aria-label={t("templates.card.previewAria", { name: resolved.name })}
        className={cn(
          "block rounded-xl transition-opacity hover:opacity-90",
          isResume && "bg-muted px-[22px] py-4",
        )}
      >
        <TemplateCardThumb meta={resolved} />
      </Link>

      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={detailPath}
          className="text-[15px] font-semibold leading-snug text-foreground hover:text-primary"
        >
          {resolved.name}
        </Link>
        {subline && (
          <span className={cn("text-[13px] text-muted-foreground", !resolved.industry && "line-clamp-2")}>
            {subline}
          </span>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-1.5">
          <PriceChip priceCents={resolved.priceCents} />
          {/* What the template makes — Video / Résumé / Article… */}
          <TemplateKindChip {...templateMetaKind(resolved)} />
          {/* Self-gates: renders nothing for non-first-party templates. */}
          <FirstPartyBadge meta={resolved} short />
        </span>
        <span className="flex items-center gap-1">
          <ShareMenu
            variant="icon"
            align="end"
            url={shareUrl}
            title={resolved.name}
            text={resolved.blurb}
            className="h-11 w-11"
          />
          {/* Only creator-published templates are user content to moderate. */}
          {resolved.origin.kind === "studio-creator" && (
            <ReportAbuseButton
              entityType="studio_template"
              entityId={resolved.origin.template.id}
              entityOwnerId={resolved.origin.template.creatorId ?? undefined}
              entityLabel="studio template"
              triggerVariant="ghost"
            />
          )}
          <TemplateApplyButton
            meta={resolved}
            size="sm"
            iconless
            labelOverride={t("actions.use")}
            className="min-h-[44px] rounded-[10px] px-3.5 text-sm font-semibold"
          />
        </span>
      </div>
    </article>
  );
}

// Right-hand column of the template detail page (TemplateDetail mockup):
//   1. info card — mono chips, the page's single H1, blurb, primary
//      "Use this template", full-width Share, account note;
//   2. "How it works" card — three numbered steps (last step in green);
//   3. "Sections included" chip list (resume kinds).
// Kind-aware copy is chosen from i18n keys here; the apply flow itself is
// the self-gating TemplateApplyButton.

import { useTranslation } from "react-i18next";
import CreatorAttribution from "@/components/studio/CreatorAttribution";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import ShareMenu from "@/components/share/ShareMenu";
import TemplateApplyButton from "@/components/templates/TemplateApplyButton";
import FirstPartyBadge from "@/components/templates/FirstPartyBadge";
import MonoChip, { PriceChip } from "@/components/templates/MonoChip";
import { cn } from "@/lib/utils";
import { isResumeTemplate, type TemplateMeta } from "@/lib/templates/types";
import type { ComponentKey, ResumeSectionKey } from "@/types/resume-template";

/** Existing locale keys for each resume section's display name. */
const SECTION_LABEL_KEYS: Record<ResumeSectionKey, string> = {
  work: "headings.workExperience",
  education: "tabs.education",
  volunteer: "headings.volunteerExperience",
  skills: "tabs.skills",
  languages: "tabs.languages",
  projects: "tabs.projects",
  awards: "tabs.awards",
  certificates: "tabs.certificates",
  publications: "tabs.publications",
  interests: "tabs.interests",
  references: "tabs.references",
};

/** Display names for platform component blocks (e.g. the career timeline). */
const COMPONENT_LABEL_KEYS: Record<ComponentKey, string> = {
  "career-timeline": "templates.detail.sectionCareerTimeline",
  "document-block": "studio.document.block.freeContent",
};

const STEP_KEYS = {
  resume: ["templates.detail.resumeStep1", "templates.detail.resumeStep2", "templates.detail.resumeStep3"],
  video: ["templates.detail.videoStep1", "templates.detail.videoStep2", "templates.detail.videoStep3"],
} as const;

/** Locale keys of a resume template's enabled blocks, in render order. */
function includedSectionKeys(meta: TemplateMeta): string[] {
  if (!meta.resumeDescriptor) return [];
  const keys: string[] = [];
  for (const block of meta.resumeDescriptor.sections) {
    if (!block.enabled) continue;
    const key =
      block.kind === "component" ? COMPONENT_LABEL_KEYS[block.component] : SECTION_LABEL_KEYS[block.key];
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

const CARD = "flex flex-col rounded-[20px] border border-border bg-card p-6";
const MONO_HEADING = "font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground";

interface Props {
  meta: TemplateMeta;
  shareUrl: string;
}

export default function TemplateDetailPanel({ meta, shareUrl }: Props) {
  const { t } = useTranslation();
  const isResume = isResumeTemplate(meta);
  const isFree = meta.priceCents <= 0;
  const sectionKeys = includedSectionKeys(meta);
  const version = meta.origin.kind === "resume" ? meta.origin.descriptor.version : null;
  const steps = isResume ? STEP_KEYS.resume : STEP_KEYS.video;

  return (
    <>
      <div className={cn(CARD, "gap-4")}>
        <div className="flex flex-wrap gap-1.5">
          <PriceChip priceCents={meta.priceCents} />
          {meta.industry && <MonoChip>{meta.industry}</MonoChip>}
          <FirstPartyBadge
            meta={meta}
            suffix={version ? t("templates.detail.version", { version }) : undefined}
          />
        </div>

        <h1 className="font-display text-[34px] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
          {meta.name}
        </h1>
        {meta.blurb && <p className="text-[15px] leading-relaxed text-foreground/80">{meta.blurb}</p>}
        {meta.origin.kind === "studio-creator" && (
          <CreatorAttribution
            creatorId={meta.origin.template.creatorId}
            label={t("templates.detail.createdBy")}
          />
        )}

        <TemplateApplyButton
          meta={meta}
          iconless
          withArrow
          labelOverride={t("templates.detail.useCta")}
          className="min-h-[54px] w-full rounded-[14px] text-[17px] font-semibold"
        />
        <ShareMenu
          variant="outline"
          size="default"
          align="center"
          url={shareUrl}
          title={meta.name}
          text={meta.blurb}
          className="min-h-[46px] w-full rounded-xl border-input bg-card text-[15px] font-semibold text-foreground"
        />
        {/* Only creator-published templates are user content to moderate. */}
        {meta.origin.kind === "studio-creator" && (
          <ReportAbuseButton
            entityType="studio_template"
            entityId={meta.origin.template.id}
            entityOwnerId={meta.origin.template.creatorId ?? undefined}
            entityLabel="studio template"
          />
        )}
        {isFree && (
          <p className="text-[13px] text-muted-foreground">
            {t(isResume ? "templates.detail.accountNoteResume" : "templates.detail.accountNoteVideo")}
          </p>
        )}
      </div>

      <div className={cn(CARD, "gap-3.5")}>
        <h2 className={MONO_HEADING}>{t("templateMarketing.howTo.title")}</h2>
        <ol className="flex flex-col gap-3 text-[15px] leading-normal text-foreground">
          {steps.map((key, i) => (
            <li key={key} className="flex gap-3">
              <span
                className={cn(
                  "font-display font-extrabold",
                  i === steps.length - 1 ? "text-brand-green" : "text-primary",
                )}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span>{t(key)}</span>
            </li>
          ))}
        </ol>
      </div>

      {sectionKeys.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <h2 className={MONO_HEADING}>{t("templates.detail.sectionsIncluded")}</h2>
          <ul className="flex flex-wrap gap-1.5 text-[13px] text-foreground">
            {sectionKeys.map((key) => (
              <li key={key} className="rounded-full border border-border bg-card px-2.5 py-[5px]">
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

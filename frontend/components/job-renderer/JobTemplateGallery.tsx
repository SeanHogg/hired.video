// JobTemplateGallery — grid of JobTemplateCard for every preset.
// Mirrors TemplateGallery for resumes. Intended for use on the Jobs
// marketing surface and as a Pro feature on /jobs/templates.

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import JobTemplateCard from "@/components/job-renderer/JobTemplateCard";
import MarketingSection, {
  type MarketingCard,
} from "@/components/marketing/MarketingSection";
import { JOB_TEMPLATE_PRESETS } from "@/types/job-template";

interface JobTemplateGalleryProps {
  /** Optional override — defaults to all built-in job presets. */
  templates?: typeof JOB_TEMPLATE_PRESETS;
  /** Tight heading/padding when embedded inside the authenticated home feed. */
  compact?: boolean;
}

export default function JobTemplateGallery({
  templates = JOB_TEMPLATE_PRESETS,
  compact,
}: JobTemplateGalleryProps) {
  const { t } = useTranslation();
  const cards: MarketingCard[] = templates.map((descriptor) => ({
    key: descriptor.id,
    node: <JobTemplateCard descriptor={descriptor} />,
  }));

  return (
    <section className={compact ? "" : "py-12"}>
      {/* Shares <MarketingSection> with the rest of the home page so the
          job-template gallery offers the same carousel | cards | list toggle. */}
      <MarketingSection
        id="job-templates"
        align="left"
        compact={compact}
        icon={Sparkles}
        title={t("headings.jobPostingTemplates")}
        subtitle={t("messages.jobTemplatesIntro", { count: templates.length })}
        cards={cards}
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      />
    </section>
  );
}

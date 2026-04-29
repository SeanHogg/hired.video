// JobTemplateGallery — grid of JobTemplateCard for every preset.
// Mirrors TemplateGallery for resumes. Intended for use on the Jobs
// marketing surface and as a Pro feature on /jobs/templates.

import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import JobTemplateCard from "@/components/job-renderer/JobTemplateCard";
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
  return (
    <section className={compact ? "" : "py-12"}>
      <div className={compact ? "mb-4" : "mb-8"}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className={compact ? "text-xl font-bold" : "text-2xl md:text-3xl font-bold"}>
            {t("headings.jobPostingTemplates")}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {t("messages.jobTemplatesIntro", { count: templates.length })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {templates.map((descriptor) => (
          <JobTemplateCard key={descriptor.id} descriptor={descriptor} />
        ))}
      </div>
    </section>
  );
}

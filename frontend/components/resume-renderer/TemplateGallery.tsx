import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import { TEMPLATE_PRESETS } from "@/types/resume-template";

interface TemplateGalleryProps {
  /** Optional override — defaults to all built-in presets. */
  templates?: typeof TEMPLATE_PRESETS;
  /** Tight heading/padding when embedded inside the authenticated home feed. */
  compact?: boolean;
  /** Override the section heading (already localized). Defaults to the
   *  "Resume Templates" key — pass a distinct title when rendering under a
   *  page that already owns that H1 (e.g. /resume-templates). */
  title?: string;
  /** Override the intro line (already localized). Defaults to the preset-count
   *  blurb. */
  subtitle?: string;
}

export default function TemplateGallery({ templates = TEMPLATE_PRESETS, compact, title, subtitle }: TemplateGalleryProps) {
  const { t } = useTranslation();
  return (
    <section className={compact ? "" : "py-12"}>
      <div className={compact ? "mb-4" : "mb-8"}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className={compact ? "text-xl font-bold" : "text-2xl md:text-3xl font-bold"}>
            {title ?? t("headings.resumeTemplates")}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {subtitle ?? t("messages.resumeTemplatesIntro", { count: templates.length })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {templates.map((descriptor) => (
          <TemplateCard key={descriptor.id} descriptor={descriptor} />
        ))}
      </div>
    </section>
  );
}

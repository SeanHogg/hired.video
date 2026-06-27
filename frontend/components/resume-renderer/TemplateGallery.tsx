import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import TemplateCard from "@/components/resume-renderer/TemplateCard";
import MarketingSection, {
  type MarketingCard,
} from "@/components/marketing/MarketingSection";
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
  const cards: MarketingCard[] = templates.map((descriptor) => ({
    key: descriptor.id,
    node: <TemplateCard descriptor={descriptor} />,
  }));

  return (
    <section className={compact ? "" : "py-12"}>
      {/* Shares <MarketingSection> with the rest of the home page so the
          template gallery offers the same carousel | cards | list toggle. */}
      <MarketingSection
        id="resume-templates"
        align="left"
        compact={compact}
        icon={Sparkles}
        title={title ?? t("headings.resumeTemplates")}
        subtitle={
          subtitle ?? t("messages.resumeTemplatesIntro", { count: templates.length })
        }
        cards={cards}
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      />
    </section>
  );
}

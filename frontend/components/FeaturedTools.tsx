// Home page "AI Career Tools" highlight grid. Renders the subset of the
// central tool catalog flagged with `showOnHome` using the shared
// <ToolCard>, matching the /tools page exactly — same catalog, same
// card component, so the two surfaces can never drift. Lays the cards out
// through <MarketingSection> so this section offers the same
// carousel | cards | list patterns as every other homepage section.

import { ArrowRight, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ToolCard } from "@/components/ToolCard";
import { getToolsForHome } from "@/data/tools-catalog";
import MarketingSection, {
  type MarketingCard,
} from "@/components/marketing/MarketingSection";

export default function FeaturedTools() {
  const { t } = useTranslation();
  const tools = getToolsForHome();
  if (tools.length === 0) return null;

  const cards: MarketingCard[] = tools.map((tool) => ({
    key: tool.id,
    node: <ToolCard tool={tool} />,
  }));

  return (
    <section className="py-8 px-4 sm:px-6 lg:px-8 border-t border-border">
      <div className="max-w-7xl mx-auto">
        <MarketingSection
          id="featured-tools"
          align="left"
          icon={Wrench}
          title={t("headings.aiCareerTools")}
          cards={cards}
          gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          headerAction={
            <Link
              to="/tools"
              className="group flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
            >
              {t("actions.viewAllTools")}
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        />
      </div>
    </section>
  );
}

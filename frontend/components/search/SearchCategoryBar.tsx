// Category pills + the shared Scroll/Grid/Table toggle for <UnifiedSearch />,
// all on ONE horizontally-scrollable row so the 16 categories never wrap into
// a wall of buttons. Pills are the design-system PillChip.

import {
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  GraduationCap,
  HelpCircle,
  Mic,
  Newspaper,
  Play,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  User,
  Wrench,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PillChip } from "@/components/content/ChipFilterRow";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import type { ViewMode } from "@/lib/hooks/useViewMode";

// Category labels resolve through i18n at render time (labelKey). The id is
// the stable wire/URL value; only the display label is localised.
export const SEARCH_CATEGORIES = [
  { id: "all", labelKey: "search.category.all", icon: TrendingUp },
  { id: "events", labelKey: "search.category.events", icon: Calendar },
  { id: "people", labelKey: "search.category.people", icon: User },
  { id: "creators", labelKey: "search.category.creators", icon: Star },
  { id: "services", labelKey: "search.category.services", icon: ShoppingBag },
  { id: "courses", labelKey: "search.category.courses", icon: GraduationCap },
  { id: "companies", labelKey: "search.category.companies", icon: Building2 },
  { id: "resumes", labelKey: "search.category.resumes", icon: User },
  { id: "jobs", labelKey: "search.category.jobs", icon: Briefcase },
  { id: "templates", labelKey: "search.category.templates", icon: Sparkles },
  { id: "media", labelKey: "search.category.media", icon: Play },
  { id: "voices", labelKey: "search.category.voices", icon: Mic },
  { id: "articles", labelKey: "search.category.articles", icon: Newspaper },
  { id: "guides", labelKey: "search.category.guides", icon: BookOpen },
  { id: "tools", labelKey: "search.category.tools", icon: Wrench },
  { id: "faqs", labelKey: "search.category.faqs", icon: HelpCircle },
];

interface Props {
  selectedCategory: string;
  onCategoryChange: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function SearchCategoryBar({ selectedCategory, onCategoryChange, viewMode, onViewModeChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label={t("search.searchType")}
        className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1"
      >
        {SEARCH_CATEGORIES.map((category) => (
          <PillChip
            key={category.id}
            active={selectedCategory === category.id}
            onClick={() => onCategoryChange(category.id)}
          >
            <category.icon className="h-4 w-4" aria-hidden="true" />
            {t(category.labelKey)}
          </PillChip>
        ))}
      </div>
      <ViewModeToggle
        value={viewMode}
        onChange={onViewModeChange}
        modes={BROWSE_VIEW_MODES}
        className="flex-shrink-0"
      />
    </div>
  );
}

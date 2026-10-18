import type { LucideIcon } from "lucide-react";
import { BarChart3, Users, Briefcase, Building2, FileText, UserPlus, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProductDashboardTab } from "./types";

/** Tab registry — order here is the rendered tab order. */
const DASHBOARD_TABS: ReadonlyArray<{ value: ProductDashboardTab; icon: LucideIcon; labelKey: string }> = [
  { value: "overview", icon: BarChart3, labelKey: "tabs.overview" },
  { value: "users", icon: Users, labelKey: "tabs.users" },
  { value: "jobs", icon: Briefcase, labelKey: "tabs.jobs" },
  { value: "companies", icon: Building2, labelKey: "tabs.companies" },
  { value: "resumes", icon: FileText, labelKey: "tabs.resumes" },
  { value: "affiliates", icon: UserPlus, labelKey: "tabs.affiliates" },
  { value: "saas", icon: Zap, labelKey: "tabs.saas" },
];

export function DashboardTabList() {
  const { t } = useTranslation();
  return (
    // Mobile: Scrollable horizontal tabs, Desktop: Grid layout
    <div className="w-full overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
      <TabsList className="inline-flex sm:grid w-auto sm:w-full sm:grid-cols-7 gap-1 min-w-max sm:min-w-0">
        {DASHBOARD_TABS.map(({ value, icon: Icon, labelKey }) => (
          <TabsTrigger key={value} value={value} className="flex items-center gap-2 text-sm whitespace-nowrap px-4 sm:px-3">
            <Icon className="h-4 w-4" />
            <span>{t(labelKey)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  );
}

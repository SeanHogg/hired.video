// Settings section navigation. One data table drives both layouts:
//   - below lg: a horizontally scrolling segmented TabsList
//   - lg+: a grouped vertical nav in a card, sticky under the top bar.
// Must render inside the page's <Tabs> root (TabsTrigger needs its context).

import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  Bell,
  Briefcase,
  Cookie,
  CreditCard,
  LayoutDashboard,
  Lock,
  Mail,
  Megaphone,
  Palette,
  Puzzle,
  Share2,
  Shield,
  Target,
  Clapperboard,
  Trophy,
  UserCircle,
  Youtube,
} from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface NavTab {
  value: string;
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  /** Label in the flat mobile strip when it differs (no group heading there). */
  mobileLabelKey?: string;
  show?: boolean;
}

interface NavGroup {
  key: string;
  labelKey: string;
  tabs: NavTab[];
}

interface SettingsTabNavProps {
  showWorkforceTab: boolean;
  showPointsTab: boolean;
  hasRecruiterSurface: boolean;
}

const DESKTOP_TRIGGER =
  "min-h-11 w-full justify-start gap-3 rounded-xl px-3 font-medium text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none";
const MOBILE_TRIGGER = "min-h-9 gap-2 px-4";
const GROUP_LABEL = "px-3 pb-1 pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground";

function buildGroups({ showWorkforceTab, showPointsTab, hasRecruiterSurface }: SettingsTabNavProps): NavGroup[] {
  const all: NavGroup[] = [
    {
      key: "account",
      labelKey: "labels.tabGroupAccount",
      tabs: [
        { value: "account-billing", icon: CreditCard, labelKey: "tabs.accountBilling" },
        { value: "workforce", icon: Briefcase, labelKey: "tabs.workforce", show: showWorkforceTab },
        { value: "points", icon: Trophy, labelKey: "tabs.pointsRewards", show: showPointsTab },
      ],
    },
    {
      key: "creator",
      labelKey: "labels.tabGroupContentCreator",
      tabs: [{ value: "creator-profile", icon: UserCircle, labelKey: "tabs.account", mobileLabelKey: "tabs.creatorAccount" }],
    },
    {
      key: "general",
      labelKey: "labels.tabGroupGeneral",
      tabs: [
        { value: "notifications", icon: Bell, labelKey: "tabs.notifications" },
        { value: "appearance", icon: Palette, labelKey: "tabs.appearance" },
      ],
    },
    {
      key: "privacy",
      labelKey: "labels.tabGroupPrivacySecurity",
      tabs: [
        { value: "privacy", icon: Shield, labelKey: "tabs.privacy" },
        { value: "profile-sections", icon: LayoutDashboard, labelKey: "tabs.profileSections" },
        { value: "cookies", icon: Cookie, labelKey: "tabs.cookies" },
        { value: "security", icon: Lock, labelKey: "tabs.security" },
      ],
    },
    {
      key: "career",
      labelKey: "labels.tabGroupCareer",
      tabs: [
        { value: "job-preferences", icon: Target, labelKey: "tabs.jobPreferences" },
        { value: "lead-generation", icon: Megaphone, labelKey: "tabs.leadGeneration" },
        { value: "video-personalization", icon: Clapperboard, labelKey: "tabs.videoPersonalization" },
      ],
    },
    {
      key: "recruiter",
      labelKey: "labels.tabGroupRecruiter",
      tabs: [{ value: "recruiter-sharing", icon: Share2, labelKey: "tabs.sharingBranding", show: hasRecruiterSurface }],
    },
    {
      key: "connections",
      labelKey: "labels.tabGroupConnections",
      tabs: [
        { value: "email", icon: Mail, labelKey: "tabs.email" },
        { value: "integrations", icon: Youtube, labelKey: "tabs.integrations" },
        { value: "extensions", icon: Puzzle, labelKey: "tabs.chromeExtensions" },
      ],
    },
  ];
  return all
    .map((g) => ({ ...g, tabs: g.tabs.filter((tab) => tab.show !== false) }))
    .filter((g) => g.tabs.length > 0);
}

export default function SettingsTabNav(props: SettingsTabNavProps) {
  const { t } = useTranslation();
  const groups = buildGroups(props);

  return (
    <aside className="lg:w-64 lg:shrink-0">
      {/* Below lg: one scrollable segmented strip. */}
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:hidden">
        <TabsList className="inline-flex h-auto w-auto min-w-max gap-1">
          {groups.flatMap((g) =>
            g.tabs.map(({ value, icon: Icon, labelKey, mobileLabelKey }) => (
              <TabsTrigger key={value} value={value} className={MOBILE_TRIGGER}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{t(mobileLabelKey ?? labelKey)}</span>
              </TabsTrigger>
            )),
          )}
        </TabsList>
      </div>

      {/* lg+: grouped vertical nav. */}
      <nav aria-label={t("headings.settings")} className="sticky top-20 hidden lg:block">
        <TabsList className="flex h-auto w-full flex-col items-stretch gap-0.5 rounded-[20px] border border-border bg-card p-2">
          {groups.map((g, i) => (
            <div key={g.key} className="flex flex-col gap-0.5">
              <div className={cn(GROUP_LABEL, i === 0 && "pt-1")}>{t(g.labelKey)}</div>
              {g.tabs.map(({ value, icon: Icon, labelKey }) => (
                <TabsTrigger key={value} value={value} className={DESKTOP_TRIGGER}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{t(labelKey)}</span>
                </TabsTrigger>
              ))}
            </div>
          ))}
        </TabsList>
      </nav>
    </aside>
  );
}

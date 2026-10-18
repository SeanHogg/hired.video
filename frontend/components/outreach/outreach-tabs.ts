import {
  Activity,
  BarChart3,
  Briefcase,
  FileText,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Rocket,
  Users,
  Video,
} from "lucide-react";
import type { TFunction } from "i18next";
import type { PageHeaderTab } from "@/components/PageHeader";

/** Page-header tab strip for the signed-in Outreach dashboard. */
export function buildOutreachTabs(t: TFunction, unreadCount: number): PageHeaderTab[] {
  return [
    { key: "dashboard", label: t("tabs.dashboard"), icon: LayoutDashboard, to: "/outreach" },
    {
      key: "inbox",
      label: t("tabs.inbox"),
      icon: Inbox,
      to: "/outreach?tab=inbox",
      badge: unreadCount > 0
        ? (unreadCount > 99 ? "99+" : unreadCount)
        : undefined,
    },
    { key: "content", label: t("tabs.myContent"), icon: Video, to: "/outreach?tab=content" },
    { key: "campaigns", label: t("tabs.campaigns"), icon: Rocket, to: "/outreach?tab=campaigns" },
    { key: "templates", label: t("tabs.templates"), icon: FileText, to: "/outreach?tab=templates" },
    { key: "tracking", label: t("tabs.trackingTab"), icon: Activity, to: "/outreach?tab=tracking" },
    { key: "contacts", label: t("tabs.contacts"), icon: Users, to: "/outreach?tab=contacts" },
    { key: "job-boards", label: t("tabs.jobBoards"), icon: Briefcase, to: "/outreach?tab=job-boards" },
    { key: "advertise", label: t("tabs.advertise"), icon: Megaphone, to: "/outreach?tab=advertise" },
    { key: "performance", label: t("tabs.performance"), icon: BarChart3, to: "/outreach?tab=performance" },
  ];
}

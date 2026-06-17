import React from "react";
import {
  FileText,
  Eye,
  Target,
  Briefcase,
  Users,
  Calendar,
  Building2,
  Download,
  BarChart3,
  Film,
  Chrome,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createRolePermissions } from "@/lib/role-utils";

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "destructive";
}

interface QuickActionsProps {
  userRole: string | number | undefined | null;
  customActions?: QuickAction[];
  loading?: boolean;
}

export function QuickActions({
  userRole,
  customActions = [],
  loading = false,
}: QuickActionsProps) {
  const { t } = useTranslation();
  const rolePermissions = createRolePermissions(userRole);

  // Define role-specific actions
  const getDefaultActions = (): QuickAction[] => {
    const actions: QuickAction[] = [];

    if (rolePermissions.isJobSeeker) {
      actions.push(
        {
          icon: Film,
          label: t("actions.generateVideoResume"),
          // Studio is the only real path to a generated video; the
          // legacy inline wizard never had a working backend.
          href: "/studio",
          variant: "default" as const,
        },
        {
          icon: FileText,
          label: t("actions.importUpdateResume"),
          href: "/resumes",
        },
        {
          icon: Chrome,
          label: t("actions.installChromeExtension"),
          href: "/chrome-extension",
        },
        {
          icon: Sparkles,
          label: t("actions.earnAsCreator"),
          href: "/services",
        },
        {
          icon: Target,
          label: t("actions.findNewJobs"),
          href: "/jobs",
        },
        {
          icon: Eye,
          label: t("actions.viewApplications"),
          href: "/applications",
        },
      );
    }

    if (rolePermissions.isRecruiter) {
      actions.push(
        {
          icon: Briefcase,
          label: t("actions.postNewJob"),
          href: "/jobs/create",
        },
        {
          icon: Users,
          label: t("actions.reviewCandidates"),
          href: "/candidates",
        },
        {
          icon: Calendar,
          label: t("actions.scheduleInterviews"),
          href: "/interviews",
        },
      );
    }

    if (rolePermissions.isEmployer) {
      actions.push(
        {
          icon: Briefcase,
          label: t("actions.postNewJob"),
          href: "/jobs/create",
        },
        {
          icon: Users,
          label: t("actions.reviewCandidates"),
          href: "/candidates",
        },
        {
          icon: Calendar,
          label: t("actions.scheduleInterviews"),
          href: "/interviews",
        },
        {
          icon: Building2,
          label: t("actions.teamAnalytics"),
          href: "/analytics/team",
        },
        {
          icon: Download,
          label: t("actions.exportReports"),
          onClick: () => {
            // TODO: Handle export functionality
          },
        },
      );
    }

    if (rolePermissions.isAdmin) {
      actions.push(
        {
          icon: BarChart3,
          label: t("actions.platformAnalytics"),
          href: "/admin/analytics",
        },
        {
          icon: Users,
          label: t("actions.userManagement"),
          href: "/admin/users",
        },
        {
          icon: Building2,
          label: t("actions.systemHealth"),
          href: "/admin/system",
        },
        {
          icon: Download,
          label: t("actions.exportData"),
          onClick: () => {
            // TODO: Handle export functionality
          },
        },
      );
    }

    return actions;
  };

  const defaultActions = getDefaultActions();
  const allActions = [...defaultActions, ...customActions];

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded animate-pulse" />
            <div className="h-5 w-24 bg-muted rounded animate-pulse" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-10 w-full bg-muted rounded animate-pulse"
            />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (allActions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t("headings.quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t("messages.noActionsAvailable")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            {t("headings.quickActions")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allActions.map((action, index) => (
            <Button
              key={index}
              className="w-full justify-start gap-3"
              variant={action.variant || "outline"}
              onClick={action.onClick}
              asChild={!!action.href}
            >
              {action.href ? (
                <a href={action.href}>
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </a>
              ) : (
                <>
                  <action.icon className="h-4 w-4" />
                  {action.label}
                </>
              )}
            </Button>
          ))}
        </CardContent>
      </Card>

    </>
  );
}

export default QuickActions;

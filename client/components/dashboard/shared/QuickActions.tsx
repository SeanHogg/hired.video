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
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createRolePermissions } from "@/lib/role-utils";

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}

interface QuickActionsProps {
  userRole: string | number | undefined | null;
  customActions?: QuickAction[];
  loading?: boolean;
}

export function QuickActions({ userRole, customActions = [], loading = false }: QuickActionsProps) {
  const rolePermissions = createRolePermissions(userRole);

  // Define role-specific actions
  const getDefaultActions = (): QuickAction[] => {
    const actions: QuickAction[] = [];

    if (rolePermissions.isJobSeeker) {
      actions.push(
        {
          icon: FileText,
          label: "Update Resume",
          href: "/resumes",
        },
        {
          icon: Eye,
          label: "View Applications",
          href: "/applications",
        },
        {
          icon: Target,
          label: "Find New Jobs",
          href: "/jobs",
        }
      );
    }

    if (rolePermissions.isRecruiter) {
      actions.push(
        {
          icon: Briefcase,
          label: "Post New Job",
          href: "/jobs/create",
        },
        {
          icon: Users,
          label: "Review Candidates",
          href: "/candidates",
        },
        {
          icon: Calendar,
          label: "Schedule Interviews",
          href: "/interviews",
        }
      );
    }

    if (rolePermissions.isEmployer) {
      actions.push(
        {
          icon: Briefcase,
          label: "Post New Job",
          href: "/jobs/create",
        },
        {
          icon: Users,
          label: "Review Candidates",
          href: "/candidates",
        },
        {
          icon: Calendar,
          label: "Schedule Interviews",
          href: "/interviews",
        },
        {
          icon: Building2,
          label: "Team Analytics",
          href: "/analytics/team",
        },
        {
          icon: Download,
          label: "Export Reports",
          onClick: () => {
            // Handle export functionality
            console.log("Export reports clicked");
          },
        }
      );
    }

    if (rolePermissions.isAdmin) {
      actions.push(
        {
          icon: BarChart3,
          label: "Platform Analytics",
          href: "/admin/analytics",
        },
        {
          icon: Users,
          label: "User Management",
          href: "/admin/users",
        },
        {
          icon: Building2,
          label: "System Health",
          href: "/admin/system",
        },
        {
          icon: Download,
          label: "Export Data",
          onClick: () => {
            // Handle export functionality
            console.log("Export data clicked");
          },
        }
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
            <div className="h-5 w-5 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-24 bg-gray-200 rounded animate-pulse" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-10 w-full bg-gray-200 rounded animate-pulse" />
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
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No actions available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Quick Actions
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
  );
}

export default QuickActions;

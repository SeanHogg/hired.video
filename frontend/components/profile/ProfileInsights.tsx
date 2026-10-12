import { useState, useEffect } from "react";
import {
  Globe,
  Lock,
  Users,
  Eye,
  FileText,
  UserPlus,
  Shield,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { userService } from "@/lib/services/user-service";
import type { ProfileStats } from "@/lib/services/dashboard-service";

type Visibility = "public" | "private" | "connections";

const VISIBILITY_OPTIONS: {
  value: Visibility;
  label: string;
  icon: typeof Globe;
  description: string;
}[] = [
  {
    value: "public",
    label: "Public",
    icon: Globe,
    description: "Anyone can view your profile",
  },
  {
    value: "connections",
    label: "Connections Only",
    icon: Users,
    description: "Only your connections can view",
  },
  {
    value: "private",
    label: "Private",
    icon: Lock,
    description: "Only you can view your profile",
  },
];

interface ProfileInsightsProps {
  /** View-level stats for the consolidated Profile Metrics card. Passed in by
   *  Profile.tsx from useDashboard(). */
  profileStats?: ProfileStats | null;
}

export default function ProfileInsights({ profileStats }: ProfileInsightsProps) {
  const { user, updateProfile, refreshUser } = useAuth();
  const [visibility, setVisibility] = useState<Visibility>(
    (user as any)?.profileVisibility ?? "public",
  );
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{
    resumeCount: number;
    connectionCount: number;
    jobApplicationCount: number;
  } | null>(null);

  useEffect(() => {
    if (user?.id) {
      userService
        .getUserStats(user.id)
        .then(setStats)
        .catch(() => {});
    }
  }, [user?.id]);

  // Sync from user if it changes
  useEffect(() => {
    if ((user as any)?.profileVisibility) {
      setVisibility((user as any).profileVisibility);
    }
  }, [(user as any)?.profileVisibility]);

  const handleVisibilityChange = async (val: Visibility) => {
    setVisibility(val);
    setSaving(true);
    try {
      await updateProfile({ profileVisibility: val } as any);
      await refreshUser();
    } catch {
      // revert on failure
      setVisibility((user as any)?.profileVisibility ?? "public");
    } finally {
      setSaving(false);
    }
  };

  const currentOption = VISIBILITY_OPTIONS.find((o) => o.value === visibility)!;
  const VisIcon = currentOption.icon;

  const viewsChange = profileStats?.viewsChangePercentage ?? 0;
  const viewsChangeClass =
    viewsChange > 0
      ? "text-green-600"
      : viewsChange < 0
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Visibility Control */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5" />
            Profile Visibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <VisIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <Select
                value={visibility}
                onValueChange={(v) =>
                  handleVisibilityChange(v as Visibility)
                }
                disabled={saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {currentOption.description}
          </p>
        </CardContent>
      </Card>

      {/* Profile Metrics — consolidated view: content counts (resumes,
          connections, applications) + viewership stats (views + recent
          viewers). Replaces the former standalone ProfileStatistics card. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Profile Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <FileText className="h-4 w-4 mx-auto mb-1 text-primary" />
              <div className="text-xl font-bold text-primary">
                {stats?.resumeCount ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Resumes</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <UserPlus className="h-4 w-4 mx-auto mb-1 text-primary" />
              <div className="text-xl font-bold text-primary">
                {stats?.connectionCount ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Connections</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <Eye className="h-4 w-4 mx-auto mb-1 text-green-600" />
              <div className="text-xl font-bold text-green-600">
                {stats?.jobApplicationCount ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Applications</div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Profile Views
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold text-primary">
                  {profileStats?.totalViews ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold text-primary">
                  {profileStats?.viewsThisWeek ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">This week</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold text-green-600">
                  {profileStats?.viewsThisMonth ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">This month</div>
              </div>
              <div className="text-center p-2 bg-muted/30 rounded-lg">
                <div className={`text-base font-bold ${viewsChangeClass}`}>
                  {viewsChange > 0 ? "+" : ""}
                  {viewsChange}%
                </div>
                <div className="text-[11px] text-muted-foreground">Change</div>
              </div>
            </div>
          </div>

          {profileStats?.recentViewers && profileStats.recentViewers.length > 0 && (
            <div className="border-t pt-4 space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recent Viewers
              </h4>
              {profileStats.recentViewers.slice(0, 3).map((viewer, index) => (
                <div
                  key={viewer.userId || index}
                  className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{viewer.name}</div>
                    {viewer.company && (
                      <div className="text-xs text-muted-foreground truncate">
                        {viewer.company}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(viewer.viewedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

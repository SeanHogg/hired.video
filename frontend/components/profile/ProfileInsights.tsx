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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { userService } from "@/lib/services/user-service";
import { formatRoleForDisplay } from "@/lib/role-utils";

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
  effectiveRole: string | null;
}

export default function ProfileInsights({ effectiveRole }: ProfileInsightsProps) {
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

  const joinedDate = (() => {
    const iso = (user as any)?.createdAt as string | undefined;
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  })();

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

      {/* Persona & Role */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Your Persona
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant="outline">
              {formatRoleForDisplay(effectiveRole ?? user?.role)}
            </Badge>
          </div>
          {user?.subscription && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <Badge variant="secondary" className="capitalize">
                {user.subscription}
              </Badge>
            </div>
          )}
          {(user as any)?.currentRole && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Title</span>
              <span className="text-sm font-medium truncate ml-4">
                {(user as any).currentRole}
              </span>
            </div>
          )}
          {(user as any)?.currentCompany && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Company</span>
              <span className="text-sm font-medium truncate ml-4">
                {(user as any).currentCompany}
              </span>
            </div>
          )}
          {joinedDate && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Member since</span>
              <span className="text-sm font-medium">{joinedDate}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile Metrics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            Profile Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <FileText className="h-4 w-4 mx-auto mb-1 text-primary" />
              <div className="text-xl font-bold text-primary">
                {stats?.resumeCount ?? 0}
              </div>
              <div className="text-xs text-muted-foreground">Resumes</div>
            </div>
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <UserPlus className="h-4 w-4 mx-auto mb-1 text-blue-600" />
              <div className="text-xl font-bold text-blue-600">
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
        </CardContent>
      </Card>
    </div>
  );
}

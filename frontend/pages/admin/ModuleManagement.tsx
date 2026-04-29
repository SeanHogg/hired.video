import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";

interface Module {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  requiredRole: string;
  planTier: string;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Group modules by a derived category based on slug/name
function getCategory(mod: Module): string {
  const s = mod.slug.toLowerCase();
  if (s.includes("video") || s.includes("job-board") || s.includes("job_board")) return "Core";
  if (s.includes("ai") || s.includes("coach") || s.includes("resume-tailor") || s.includes("interview")) return "AI";
  if (s.includes("outreach") || s.includes("ats") || s.includes("applicant") || s.includes("recruit")) return "Recruiting";
  if (s.includes("social") || s.includes("feed")) return "Social";
  if (s.includes("chrome") || s.includes("extension")) return "Tools";
  if (s.includes("affiliate") || s.includes("ad") || s.includes("ads")) return "Revenue";
  if (s.includes("referral") || s.includes("banner")) return "Growth";
  return "Other";
}

const CATEGORY_ORDER = ["Core", "AI", "Recruiting", "Social", "Tools", "Revenue", "Growth", "Other"];

export default function ModuleManagement() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const { can } = useAdminPermissions();
  const canToggle = can("modules", "update");
  const { toast } = useToast();

  const loadModules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<Module[]>("/api/admin/impersonate/modules");
      setModules(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadModules"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadModules(); }, [loadModules]);

  const toggle = async (mod: Module) => {
    setToggling(prev => new Set(prev).add(mod.id));
    try {
      await apiClient.put(`/api/admin/impersonate/modules/${mod.id}`, { isActive: !mod.isActive });
      setModules(prev => prev.map(m => m.id === mod.id ? { ...m, isActive: !m.isActive } : m));
      toast({ title: `${mod.name} ${!mod.isActive ? "enabled" : "disabled"}` });
    } catch {
      toast({ title: `Failed to toggle ${mod.name}`, variant: "destructive" });
    } finally {
      setToggling(prev => { const s = new Set(prev); s.delete(mod.id); return s; });
    }
  };

  const grouped = CATEGORY_ORDER.reduce<Record<string, Module[]>>((acc, cat) => {
    acc[cat] = modules.filter((m) => getCategory(m) === cat);
    return acc;
  }, {});

  const enabledCount = modules.filter((m) => m.isActive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading modules...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-destructive py-8">
        {error}
        <Button variant="ghost" size="sm" className="ml-2" onClick={loadModules}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Modules & Features</h1>
          <p className="text-muted-foreground text-sm">
            Enable or disable platform features globally.
            {!canToggle && " You have read-only access."}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{enabledCount}</span> / {modules.length} enabled
        </div>
      </div>

      {CATEGORY_ORDER.map((category) => {
        const items = grouped[category];
        if (!items?.length) return null;
        return (
          <div key={category}>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((mod) => (
                <Card key={mod.id} className={mod.isActive ? "" : "opacity-60"}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{mod.name}</p>
                          {mod.planTier !== "free" && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {mod.planTier}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Required role: {mod.requiredRole}
                        </p>
                      </div>
                      <Switch
                        checked={mod.isActive}
                        onCheckedChange={() => toggle(mod)}
                        disabled={!canToggle || toggling.has(mod.id)}
                        aria-label={`Toggle ${mod.name}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

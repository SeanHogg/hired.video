// SuperAdmin — assign features & navigation to each role. Toggle which menu
// items / features every role sees, reset a role to defaults, and validate the
// result live via Preview-as-role + the permission debugger.
//
// Reads/writes /api/admin/role-access (RoleAccessService). The per-role view is
// resolved with the SAME shared resolver the app uses (resolveRoleAccess), so
// what you see here is exactly what the role sees — registry defaults ⊕ the
// stored overrides. Replaces the hardcoded Sidebar deny-list (#1995 → #2037).

import { useEffect, useMemo, useState } from "react";
import {
  Shield,
  Eye,
  RotateCcw,
  Loader2,
  Bug,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { roleAccessService } from "@/lib/services/role-access-service";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { usePermissionDebugger } from "@/providers/PermissionDebuggerProvider";
import {
  resolveRoleAccess,
  type RoleFeatureAccessRow,
  type ResolvedSurface,
} from "@shared/role-access";
import {
  ALL_ROLES,
  type FeatureRegistryEntry,
} from "@shared/feature-registry";
import { USER_ROLES, type UserRole } from "@shared/user-roles";

const ROLE_LABELS: Record<string, string> = {
  [USER_ROLES.JOB_SEEKER]: "Job Seeker",
  [USER_ROLES.RECRUITER]: "Recruiter",
  [USER_ROLES.EMPLOYER]: "Employer",
  [USER_ROLES.EMPLOYEE]: "Employee",
  [USER_ROLES.CREATOR]: "Creator",
  [USER_ROLES.AFFILIATE]: "Affiliate",
  [USER_ROLES.ADMIN]: "Admin",
  [USER_ROLES.SUPER_ADMIN]: "Super Admin",
};

export default function RoleAccessManager() {
  const [registry, setRegistry] = useState<FeatureRegistryEntry[]>([]);
  const [overrides, setOverrides] = useState<RoleFeatureAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(USER_ROLES.JOB_SEEKER);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { personaPreview, setPersonaPreview } = usePersonaPreview();
  const { debugMode, toggleDebugMode } = usePermissionDebugger();

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await roleAccessService.adminGet();
      setRegistry(data.registry);
      setOverrides(data.overrides);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Resolve the active role's manifest with the shared resolver — identical to
  // what the role sees in-app. The registry came from the server, but the
  // resolver is pure, so we apply it client-side (no per-role round trips).
  const surfaces = useMemo<ResolvedSurface[]>(() => {
    if (registry.length === 0) return [];
    return resolveRoleAccess(role, overrides).surfaces;
  }, [registry, overrides, role]);

  // Group surfaces by their registry group for the UI.
  const grouped = useMemo(() => {
    const m = new Map<string, ResolvedSurface[]>();
    for (const s of surfaces) {
      const list = m.get(s.group) ?? [];
      list.push(s);
      m.set(s.group, list);
    }
    return Array.from(m.entries());
  }, [surfaces]);

  const overrideFor = (key: string): RoleFeatureAccessRow | undefined =>
    overrides.find((o) => o.role === role && o.featureKey === key);

  // Upsert one surface's override, preserving its other tri-state fields.
  const patchSurface = async (
    key: string,
    patch: Partial<Pick<RoleFeatureAccessRow, "visible" | "enabled" | "rank">>,
  ) => {
    const existing = overrideFor(key);
    const next = {
      role,
      featureKey: key,
      visible: patch.visible ?? existing?.visible ?? null,
      enabled: patch.enabled ?? existing?.enabled ?? null,
      rank: patch.rank ?? existing?.rank ?? null,
    };
    setBusyKey(key);
    try {
      await roleAccessService.adminUpsert(next);
      // Update local override set so the resolver re-runs without a round trip.
      setOverrides((prev) => {
        const others = prev.filter(
          (o) => !(o.role === role && o.featureKey === key),
        );
        return [...others, next];
      });
    } finally {
      setBusyKey(null);
    }
  };

  const resetRole = async () => {
    setBusyKey("reset");
    try {
      await roleAccessService.adminReset(role);
      setOverrides((prev) => prev.filter((o) => o.role !== role));
    } finally {
      setBusyKey(null);
    }
  };

  const previewingThisRole = personaPreview === role;
  const overriddenCount = surfaces.filter((s) => s.overridden).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Role Access
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Choose which navigation items and features each role sees, so every
            persona gets a focused app. Changes are live — no deploy. Use{" "}
            <strong>Preview as role</strong> and the{" "}
            <strong>Permission Debugger</strong> to validate exactly what a role
            can see.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={debugMode ? "default" : "outline"}
            onClick={toggleDebugMode}
            title="Toggle the permission debugger overlay (Ctrl+Shift+P)"
          >
            <Bug className="h-4 w-4 mr-1.5" />
            {debugMode ? "Debugger on" : "Debugger"}
          </Button>
          {previewingThisRole ? (
            <Button variant="destructive" onClick={() => setPersonaPreview(null)}>
              <StopCircle className="h-4 w-4 mr-1.5" />
              Exit preview
            </Button>
          ) : (
            <Button onClick={() => setPersonaPreview(role)}>
              <PlayCircle className="h-4 w-4 mr-1.5" />
              Preview as {ROLE_LABELS[role]}
            </Button>
          )}
        </div>
      </div>

      {personaPreview && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Previewing the app as <strong>{ROLE_LABELS[personaPreview] ?? personaPreview}</strong>.
          Navigate the app to see this role's menu; return here and click
          “Exit preview” when done.
        </div>
      )}

      <Tabs value={role} onValueChange={(v) => setRole(v as UserRole)}>
        <TabsList className="flex-wrap h-auto">
          {ALL_ROLES.map((r) => (
            <TabsTrigger key={r} value={r}>
              {ROLE_LABELS[r] ?? r}
            </TabsTrigger>
          ))}
        </TabsList>

        {ALL_ROLES.map((r) => (
          <TabsContent key={r} value={r} className="mt-4 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {overriddenCount > 0 ? (
                  <>
                    <Badge variant="secondary" className="mr-1.5">
                      {overriddenCount}
                    </Badge>
                    surface{overriddenCount === 1 ? "" : "s"} differ from the
                    defaults.
                  </>
                ) : (
                  "Using registry defaults for this role."
                )}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetRole}
                disabled={busyKey === "reset" || overriddenCount === 0}
                className="text-muted-foreground"
              >
                {busyKey === "reset" ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-1.5" />
                )}
                Reset to defaults
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    {group}
                  </h3>
                  <div className="space-y-1.5">
                    {items.map((s) => (
                      <SurfaceRow
                        key={s.key}
                        surface={s}
                        busy={busyKey === s.key}
                        onToggleVisible={(v) => patchSurface(s.key, { visible: v })}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function SurfaceRow({
  surface,
  busy,
  onToggleVisible,
}: {
  surface: ResolvedSurface;
  busy: boolean;
  onToggleVisible: (v: boolean) => void;
}) {
  // Phase-1 nav surfaces are cosmetic (enforce=false): toggling Visible hides
  // the menu link. The enforced "Enabled" (server-gated) toggle arrives with
  // feature modules in Phase 3 (#2039).
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{surface.label}</span>
          {surface.href && (
            <code className="text-[11px] text-muted-foreground">{surface.href}</code>
          )}
          {surface.overridden && (
            <Badge variant="outline" className="text-[10px]">
              overridden
            </Badge>
          )}
          {!surface.visible && <Badge variant="secondary">Hidden</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Switch
            checked={surface.visible}
            onCheckedChange={onToggleVisible}
            disabled={busy}
            aria-label={`Toggle visibility of ${surface.label}`}
          />
          <Label className="text-xs text-muted-foreground w-12">
            {surface.visible ? "Visible" : "Hidden"}
          </Label>
        </div>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

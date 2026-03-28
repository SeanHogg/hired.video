import React, { useState, useEffect } from "react";
import { AlertTriangle, Eye, Copy, LogOut, ChevronDown, Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { usePermissionDebugger } from "@/providers/PermissionDebuggerProvider";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { USER_ROLES } from "@shared/user-roles";
import { getRoleDisplayLabel } from "@/lib/role-utils";

const ROLES = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.AFFILIATE,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
];

// ── Session timer ─────────────────────────────────────────────────────────────
function useElapsed(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Expiry warning ────────────────────────────────────────────────────────────
function useExpiryWarning(expiresAt: string | null, onExpired: () => void) {
  const { toast } = useToast();
  useEffect(() => {
    if (!expiresAt) return;
    const expMs = new Date(expiresAt).getTime();
    const now = Date.now();
    const t10 = expMs - 10 * 60 * 1000 - now;
    const t5  = expMs - 5  * 60 * 1000 - now;
    const t0  = expMs - now;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (t10 > 0) timers.push(setTimeout(() => toast({ title: "Impersonation expiring soon", description: "Session expires in 10 minutes." }), t10));
    if (t5  > 0) timers.push(setTimeout(() => toast({ title: "Impersonation expiring soon", description: "Session expires in 5 minutes.", variant: "destructive" }), t5));
    if (t0  > 0) timers.push(setTimeout(() => { toast({ title: "Impersonation session expired", variant: "destructive" }); onExpired(); }, t0));
    return () => timers.forEach(clearTimeout);
  }, [expiresAt, onExpired, toast]);
}

// ── Hook: exposes active-emulation state for Nav background styling ───────────
export function useEmulationStyle() {
  const { isSuperAdmin, isImpersonating } = useAuth();
  const { personaPreview } = usePersonaPreview();

  if (!isSuperAdmin) return null;
  if (isImpersonating) return "amber" as const;
  if (personaPreview !== null) return "blue" as const;
  return null;
}

// ── Unified header controls ───────────────────────────────────────────────────
// Renders inside the header row for all SuperAdmin states.
// Idle  → SuperAdmin badge + Preview role dropdown + Debug toggle.
// Active → status badge + role switcher + permissions + copy + exit (all inline).
export function EmulationHeaderControls() {
  const {
    user, isSuperAdmin,
    impersonationSession, isImpersonating,
    endImpersonation, switchImpersonationRole,
  } = useAuth();
  const { debugMode, toggleDebugMode, checks } = usePermissionDebugger();
  const { toast } = useToast();
  const { personaPreview, setPersonaPreview } = usePersonaPreview();
  const elapsed = useElapsed(impersonationSession?.startedAt ?? null);

  useExpiryWarning(impersonationSession?.expiresAt ?? null, endImpersonation);

  if (!isSuperAdmin) return null;

  const isPreviewMode = !isImpersonating && personaPreview !== null;

  // ── Idle: no active session ──────────────────────────────────────────────
  if (!isImpersonating && !isPreviewMode) {
    return (
      <div className="flex items-center gap-1">
        <Badge variant="secondary" className="text-xs">SuperAdmin</Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2">
              <Eye className="h-3 w-3" />Preview role<ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ROLES.map((r) => (
              <DropdownMenuItem key={r} onSelect={() => setPersonaPreview(r)}>
                {getRoleDisplayLabel(r)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={debugMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs gap-1 px-2"
          onClick={toggleDebugMode}
          title="Toggle permission debugger (Ctrl+Shift+P)"
        >
          <Bug className="h-3 w-3" />Debug
        </Button>
      </div>
    );
  }

  // ── Active: impersonating or role preview ────────────────────────────────
  const effectiveRole = impersonationSession?.role ?? personaPreview ?? user?.role ?? "";
  const permCount = checks.size;
  const isAmber = isImpersonating;

  const handleCopyContext = async () => {
    const ctx = {
      type: isImpersonating ? "impersonation" : "persona_preview",
      userId: impersonationSession?.targetUser.id ?? null,
      email: impersonationSession?.targetUser.email ?? null,
      role: effectiveRole,
      sessionId: impersonationSession?.sessionId ?? null,
      permissionCount: permCount,
      timestamp: new Date().toISOString(),
    };
    await navigator.clipboard.writeText(JSON.stringify(ctx, null, 2));
    toast({ title: "Context copied to clipboard" });
  };

  const handleExit = async () => {
    if (isImpersonating) {
      await endImpersonation();
      toast({ title: "Impersonation ended", description: `Duration: ${formatDuration(elapsed)}` });
    } else {
      setPersonaPreview(null);
    }
  };

  const badgeCls = isAmber
    ? "bg-amber-500 text-white"
    : "bg-blue-500 text-white";
  const btnBorderCls = isAmber ? "border-amber-400" : "border-blue-300";

  return (
    <div className="flex items-center gap-1.5">
      {/* Status badge */}
      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${badgeCls}`}>
        <AlertTriangle className="h-3 w-3" />
        {isImpersonating ? "EMULATING" : "ROLE PREVIEW"}
      </span>

      {/* Target user name — impersonation only, hidden on narrow screens */}
      {isImpersonating && impersonationSession && (
        <span className="hidden sm:inline text-xs font-medium truncate max-w-[120px]">
          {impersonationSession.targetUser.name}
        </span>
      )}

      {/* Role switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 text-xs gap-1 ${btnBorderCls}`}
          >
            Role: {getRoleDisplayLabel(effectiveRole)}<ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {ROLES.map((r) => (
            <DropdownMenuItem
              key={r}
              onSelect={() => isImpersonating ? switchImpersonationRole(r) : setPersonaPreview(r)}
            >
              {getRoleDisplayLabel(r)} {r === effectiveRole && "✓"}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Permissions / debug toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 px-2"
        onClick={toggleDebugMode}
        title="Toggle permission debugger (Ctrl+Shift+P)"
      >
        <Bug className="h-3 w-3" />
        Permissions
        {debugMode && <Badge className="ml-1 h-4 text-[10px] px-1">ON</Badge>}
      </Button>

      {/* Session timer — impersonation only */}
      {isImpersonating && (
        <span className="hidden sm:inline text-xs tabular-nums">
          {formatDuration(elapsed)}
        </span>
      )}

      {/* Copy context */}
      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleCopyContext}>
        <Copy className="h-3 w-3" />
        <span className="hidden sm:inline">Copy Context</span>
      </Button>

      {/* Exit */}
      <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={handleExit}>
        <LogOut className="h-3 w-3" />
        {isImpersonating ? "Exit Emulation" : "Exit Preview"}
      </Button>
    </div>
  );
}

// ── Legacy exports (kept so old import sites don't break) ────────────────────
/** @deprecated Use EmulationHeaderControls */
export function EmulationInlineControls() { return null; }
/** @deprecated Use EmulationHeaderControls */
export function EmulationActiveBanner()   { return null; }
/** @deprecated Use EmulationHeaderControls */
export function EmulationBar()            { return null; }

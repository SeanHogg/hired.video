import React, { useEffect } from "react";
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
    const t5 = expMs - 5 * 60 * 1000 - now;
    const t0 = expMs - now;
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (t10 > 0) timers.push(setTimeout(() => toast({ title: "Impersonation expiring soon", description: "Session expires in 10 minutes." }), t10));
    if (t5 > 0) timers.push(setTimeout(() => toast({ title: "Impersonation expiring soon", description: "Session expires in 5 minutes.", variant: "destructive" }), t5));
    if (t0 > 0) timers.push(setTimeout(() => { toast({ title: "Impersonation session expired", variant: "destructive" }); onExpired(); }, t0));
    return () => timers.forEach(clearTimeout);
  }, [expiresAt, onExpired, toast]);
}

// ── Main component ────────────────────────────────────────────────────────────
export function EmulationBar() {
  const { user, isSuperAdmin, impersonationSession, isImpersonating, endImpersonation, switchImpersonationRole } = useAuth();
  const { debugMode, toggleDebugMode, checks } = usePermissionDebugger();
  const { toast } = useToast();
  const { personaPreview, setPersonaPreview } = usePersonaPreview();
  const elapsed = useElapsed(impersonationSession?.startedAt ?? null);

  useExpiryWarning(impersonationSession?.expiresAt ?? null, endImpersonation);

  if (!isSuperAdmin) return null;

  const isPreviewMode = !isImpersonating && personaPreview !== null;
  if (!isImpersonating && !isPreviewMode) {
    // Collapsed state — just a thin strip
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs bg-muted border-b">
        <Badge variant="secondary" className="text-xs">SuperAdmin</Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
              <Eye className="h-3 w-3" />Preview role<ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ROLES.map((r) => (
              <DropdownMenuItem key={r} onSelect={() => setPersonaPreview(r)}>
                {getRoleDisplayLabel(r)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={toggleDebugMode}
        >
          <Bug className="h-3 w-3" />
          {debugMode ? "Debug ON" : "Debug"}
        </Button>
      </div>
    );
  }

  const barBg = isImpersonating ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-300";
  const badgeBg = isImpersonating ? "bg-amber-500 text-white" : "bg-blue-500 text-white";

  const effectiveRole = impersonationSession?.role ?? personaPreview ?? user?.role ?? "";
  const permCount = checks.size;

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

  const minutesElapsed = Math.floor(elapsed / 60);
  const timerAmber = minutesElapsed >= 50;

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border-b text-xs flex-wrap ${barBg}`}>
      {/* Status badge */}
      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${badgeBg}`}>
        <AlertTriangle className="h-3 w-3" />
        {isImpersonating ? "EMULATING" : "ROLE PREVIEW"}
      </span>

      {/* Target user / role info */}
      {isImpersonating && impersonationSession && (
        <>
          <span className="font-medium text-amber-900">
            {impersonationSession.targetUser.name}
          </span>
          <span className="text-amber-700">{impersonationSession.targetUser.email}</span>
          <span className="text-amber-600">·</span>
        </>
      )}

      {/* Role switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 text-xs gap-1 border-amber-300">
            Role: {getRoleDisplayLabel(effectiveRole)} <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
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

      {/* Permission count */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs gap-1"
        onClick={toggleDebugMode}
        title="Toggle permission debugger (Ctrl+Shift+P)"
      >
        <Bug className="h-3 w-3" />
        {permCount > 0 ? `${permCount} permissions` : "Permissions"}
        {debugMode && <Badge className="ml-1 h-4 text-xs">ON</Badge>}
      </Button>

      {/* Session timer */}
      {isImpersonating && (
        <span className={`tabular-nums ${timerAmber ? "text-amber-600 font-semibold" : "text-amber-800"}`}>
          {formatDuration(elapsed)}
        </span>
      )}

      <div className="flex-1" />

      {/* Copy context */}
      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={handleCopyContext}>
        <Copy className="h-3 w-3" />Copy Context
      </Button>

      {/* Exit */}
      <Button
        variant="destructive"
        size="sm"
        className="h-6 text-xs gap-1"
        onClick={handleExit}
      >
        <LogOut className="h-3 w-3" />
        {isImpersonating ? "Exit Emulation" : "Exit Preview"}
      </Button>
    </div>
  );
}

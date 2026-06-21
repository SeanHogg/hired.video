import { useState, useEffect } from "react";
import { AlertTriangle, Eye, Copy, LogOut, ChevronDown, Bug, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { usePermissionDebugger } from "@/providers/PermissionDebuggerProvider";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { USER_ROLES } from "@shared/user-roles";
import { getRoleDisplayLabel } from "@/lib/role-utils";

const ROLES = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
];

// Admin/SA roles bypass all tier gates — tier preview is meaningful only for
// the seat-paying roles.
const TIERED_ROLES = new Set<string>([
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
]);

interface PreviewOption {
  role: string;
  tier: "free" | "pro" | null;
  label: string;
}

function buildPreviewOptions(): PreviewOption[] {
  const opts: PreviewOption[] = [];
  for (const r of ROLES) {
    if (TIERED_ROLES.has(r)) {
      opts.push({ role: r, tier: "free", label: `${getRoleDisplayLabel(r)} (Free)` });
      opts.push({ role: r, tier: "pro",  label: `${getRoleDisplayLabel(r)} (Pro)` });
    } else {
      opts.push({ role: r, tier: null, label: getRoleDisplayLabel(r) });
    }
  }
  return opts;
}

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

const PREVIEW_OPTIONS = buildPreviewOptions();

// ── Shared controls hook ──────────────────────────────────────────────────────
// Centralises every SuperAdmin control's state + handlers so the desktop inline
// strip (EmulationHeaderControls) and the mobile avatar-menu section
// (SuperAdminMenuItems) stay in lock-step (DRY). Deliberately does NOT run the
// expiry-warning side effect — that lives once in EmulationHeaderControls (which
// is always mounted) so the warning toasts never fire twice.
export function useSuperAdminControls() {
  const {
    isSuperAdmin,
    impersonationSession, isImpersonating,
    endImpersonation, switchImpersonationRole,
  } = useAuth();
  const { debugMode, toggleDebugMode, checks } = usePermissionDebugger();
  const { toast } = useToast();
  const { personaPreview, tierPreview, setPersonaPreview } = usePersonaPreview();
  const effectiveRole = useEffectiveRole() ?? "";
  const elapsed = useElapsed(impersonationSession?.startedAt ?? null);

  const isPreviewMode = !isImpersonating && personaPreview !== null;
  const isActive = isImpersonating || isPreviewMode;
  const isAmber = isImpersonating;

  const effectiveLabel = isImpersonating
    ? getRoleDisplayLabel(effectiveRole)
    : tierPreview
      ? `${getRoleDisplayLabel(effectiveRole)} (${tierPreview === "pro" ? "Pro" : "Free"})`
      : getRoleDisplayLabel(effectiveRole);
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
    try {
      await navigator.clipboard.writeText(JSON.stringify(ctx, null, 2));
      toast({ title: "Context copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", description: "Clipboard access denied by browser", variant: "destructive" });
    }
  };

  const handleExit = async () => {
    if (isImpersonating) {
      await endImpersonation();
      toast({ title: "Impersonation ended", description: `Duration: ${formatDuration(elapsed)}` });
    } else {
      setPersonaPreview(null);
    }
  };

  // Role-preview menu items — idle state. Shared between the mobile avatar menu
  // and the desktop "Preview role" dropdown (DRY).
  const renderPreviewItems = () =>
    PREVIEW_OPTIONS.map((opt) => (
      <DropdownMenuItem
        key={`${opt.role}-${opt.tier ?? "none"}`}
        onSelect={() => setPersonaPreview(opt.role, opt.tier)}
      >
        <Eye className="h-3.5 w-3.5 mr-2" />
        {opt.label}
      </DropdownMenuItem>
    ));

  // Role-switch menu items — active state. Impersonation switches the live role;
  // preview swaps the persona/tier.
  const renderActiveRoleItems = () =>
    isImpersonating
      ? ROLES.map((r) => (
          <DropdownMenuItem key={r} onSelect={() => switchImpersonationRole(r)}>
            {getRoleDisplayLabel(r)} {r === effectiveRole && "✓"}
          </DropdownMenuItem>
        ))
      : PREVIEW_OPTIONS.map((opt) => {
          const active = opt.role === effectiveRole && opt.tier === tierPreview;
          return (
            <DropdownMenuItem
              key={`${opt.role}-${opt.tier ?? "none"}`}
              onSelect={() => setPersonaPreview(opt.role, opt.tier)}
            >
              {opt.label} {active && "✓"}
            </DropdownMenuItem>
          );
        });

  return {
    isSuperAdmin,
    impersonationSession, isImpersonating, endImpersonation,
    isPreviewMode, isActive, isAmber,
    debugMode, toggleDebugMode,
    effectiveLabel, permCount, elapsed,
    handleCopyContext, handleExit,
    renderPreviewItems, renderActiveRoleItems,
  };
}

// ── Mobile: SuperAdmin section embedded in the avatar (UserMenu) dropdown ──────
// Renders as a set of menu items (leading with its own separator) intended to
// live INSIDE an existing DropdownMenuContent. Self-gates: renders nothing for
// non-SuperAdmins, so the host menu can drop it in unconditionally. The active
// emulation/preview state stays discoverable via the tinted top bar
// (useEmulationStyle), so folding the trigger into the avatar loses no signal.
export function SuperAdminMenuItems() {
  const c = useSuperAdminControls();
  if (!c.isSuperAdmin) return null;

  return (
    <>
      <DropdownMenuSeparator />
      {!c.isActive ? (
        <>
          <DropdownMenuLabel className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" />SuperAdmin
          </DropdownMenuLabel>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Preview as role
          </DropdownMenuLabel>
          {c.renderPreviewItems()}
          <DropdownMenuItem onSelect={c.toggleDebugMode}>
            <Bug className="h-3.5 w-3.5 mr-2" />
            {c.debugMode ? "Disable" : "Enable"} permission debugger
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <DropdownMenuLabel className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            {c.isImpersonating ? "Emulating" : "Role preview"}
          </DropdownMenuLabel>
          {c.isImpersonating && (
            <div className="px-2 pb-1.5 text-xs text-muted-foreground">
              {c.impersonationSession && (
                <div className="truncate font-medium text-foreground">
                  {c.impersonationSession.targetUser.name}
                </div>
              )}
              <div className="tabular-nums">{formatDuration(c.elapsed)}</div>
            </div>
          )}
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {c.isImpersonating ? "Switch role" : "Preview as"}
          </DropdownMenuLabel>
          {c.renderActiveRoleItems()}
          <DropdownMenuItem onSelect={c.toggleDebugMode}>
            <Bug className="h-3.5 w-3.5 mr-2" />
            {c.debugMode ? "Disable" : "Enable"} permission debugger
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={c.handleCopyContext}>
            <Copy className="h-3.5 w-3.5 mr-2" />Copy context
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={c.handleExit}
            className="text-destructive focus:text-destructive"
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            {c.isImpersonating ? "Exit emulation" : "Exit preview"}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

// ── Desktop: inline header controls ───────────────────────────────────────────
// Renders the SuperAdmin strip inline in the top bar on md+ only. On mobile the
// same controls live in the avatar menu (SuperAdminMenuItems) to keep the
// narrow top bar uncluttered and let the user's avatar fit. This component is
// always mounted (just CSS-hidden on mobile), so it owns the single
// expiry-warning side effect.
export function EmulationHeaderControls() {
  const c = useSuperAdminControls();

  useExpiryWarning(c.impersonationSession?.expiresAt ?? null, c.endImpersonation);

  if (!c.isSuperAdmin) return null;

  // ── Idle: no active session ──────────────────────────────────────────────
  if (!c.isActive) {
    return (
      <div className="hidden md:flex items-center gap-1">
        <Badge variant="secondary" className="text-xs">SuperAdmin</Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2">
              <Eye className="h-3 w-3" />Preview role<ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {c.renderPreviewItems()}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={c.debugMode ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-xs gap-1 px-2"
          onClick={c.toggleDebugMode}
          title="Toggle permission debugger (Ctrl+Shift+P)"
        >
          <Bug className="h-3 w-3" />Debug
        </Button>
      </div>
    );
  }

  // ── Active: impersonating or role preview ────────────────────────────────
  const badgeCls = c.isAmber
    ? "bg-amber-500 text-white"
    : "bg-blue-500 text-white";
  const btnBorderCls = c.isAmber ? "border-amber-400" : "border-blue-300";

  return (
    <div className="hidden md:flex items-center gap-1.5">
      {/* Status badge */}
      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-xs ${badgeCls}`}>
        <AlertTriangle className="h-3 w-3" />
        {c.isImpersonating ? "EMULATING" : "ROLE PREVIEW"}
      </span>

      {/* Target user name — impersonation only */}
      {c.isImpersonating && c.impersonationSession && (
        <span className="text-xs font-medium truncate max-w-[120px]">
          {c.impersonationSession.targetUser.name}
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
            Role:&nbsp;{c.effectiveLabel}<ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {c.renderActiveRoleItems()}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Permissions / debug toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 px-2"
        onClick={c.toggleDebugMode}
        title="Toggle permission debugger (Ctrl+Shift+P)"
      >
        <Bug className="h-3 w-3" />
        Permissions
        {c.debugMode && <Badge className="ml-1 h-4 text-[10px] px-1">ON</Badge>}
      </Button>

      {/* Session timer — impersonation only */}
      {c.isImpersonating && (
        <span className="text-xs tabular-nums">
          {formatDuration(c.elapsed)}
        </span>
      )}

      {/* Copy context */}
      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={c.handleCopyContext}>
        <Copy className="h-3 w-3" />
        Copy Context
      </Button>

      {/* Exit */}
      <Button
        variant="destructive"
        size="sm"
        className="h-7 text-xs gap-1 px-2"
        onClick={c.handleExit}
        title={c.isImpersonating ? "Exit Emulation" : "Exit Preview"}
      >
        <LogOut className="h-3 w-3" />
        {c.isImpersonating ? "Exit Emulation" : "Exit Preview"}
      </Button>
    </div>
  );
}

import { useState, useEffect } from "react";
import { AlertTriangle, Eye, Copy, LogOut, Bug, Shield } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/auth";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import { usePermissionDebugger } from "@/providers/PermissionDebuggerProvider";
import { usePersonaPreview } from "@/providers/PersonaPreviewProvider";
import { USER_ROLES } from "@shared/user-roles";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { formatDurationMinSec } from "@/lib/format";

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
// Centralises every SuperAdmin control's state + handlers behind the one
// surface that renders them (SuperAdminMenuItems, inside the avatar menu).
// Deliberately does NOT run the expiry-warning side effect — that lives once in
// EmulationExpiryWatcher (always mounted) so the toasts never fire twice.
function useSuperAdminControls() {
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

  const isActive = isImpersonating || personaPreview !== null;

  const handleCopyContext = async () => {
    const ctx = {
      type: isImpersonating ? "impersonation" : "persona_preview",
      userId: impersonationSession?.targetUser.id ?? null,
      email: impersonationSession?.targetUser.email ?? null,
      role: effectiveRole,
      sessionId: impersonationSession?.sessionId ?? null,
      permissionCount: checks.size,
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
      toast({ title: "Impersonation ended", description: `Duration: ${formatDurationMinSec(elapsed)}` });
    } else {
      setPersonaPreview(null);
    }
  };

  // Role-preview menu items — idle state.
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
    impersonationSession, isImpersonating, isActive,
    debugMode, toggleDebugMode, elapsed,
    handleCopyContext, handleExit,
    renderPreviewItems, renderActiveRoleItems,
  };
}

// ── SuperAdmin section embedded in the avatar (UserMenu) dropdown ─────────────
// Renders as a set of menu items (leading with its own separator) intended to
// live INSIDE an existing DropdownMenuContent. Self-gates: renders nothing for
// non-SuperAdmins, so the host menu can drop it in unconditionally. The active
// emulation/preview state stays discoverable at a glance via the tinted top bar
// (useEmulationStyle), so folding these controls in loses no signal.
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
              <div className="tabular-nums">{formatDurationMinSec(c.elapsed)}</div>
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

// ── Always-mounted side effect: impersonation expiry warnings ─────────────────
// The SuperAdmin controls now live entirely inside the avatar menu, whose
// content unmounts when the menu closes — so the expiry countdown can't live
// there. This renders nothing and exists only to own that single side effect
// once, from the chrome. Self-gates: a non-SuperAdmin has no session to watch.
export function EmulationExpiryWatcher(): null {
  const { isSuperAdmin, impersonationSession, endImpersonation } = useAuth();
  useExpiryWarning(
    isSuperAdmin ? impersonationSession?.expiresAt ?? null : null,
    endImpersonation,
  );
  return null;
}

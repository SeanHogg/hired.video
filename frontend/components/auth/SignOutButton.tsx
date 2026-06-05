import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignOutVariant = "row" | "icon" | "inline";

interface SignOutButtonProps {
  /** Presentation:
   *  - "row" (default): full-width labelled row — sidebar drawer footer.
   *  - "icon": icon-only ghost button — mobile top bar.
   *  - "inline": ghost button, icon + label that collapses to icon-only
   *    below `sm` — the minimal brand header strip. */
  variant?: SignOutVariant;
  /** Sidebar collapsed rail (row variant only): center the icon, label via tooltip. */
  collapsed?: boolean;
  /** Navigate here (replace) after sign-out — e.g. "/login" from the
   *  bootstrap / verification-limbo shell. */
  redirectTo?: string;
  /** Runs after sign-out, before any redirect (e.g. close the drawer). */
  onAfter?: () => void;
  className?: string;
}

/**
 * Single source of truth for the sign-out control. Owns the
 * `useAuth().logout` call (and the optional post-logout redirect) so every
 * chrome surface — sidebar drawer, mobile top bar, bootstrap brand header —
 * shares one implementation rather than re-wiring logout per call site.
 */
export function SignOutButton({
  variant = "row",
  collapsed,
  redirectTo,
  onAfter,
  className,
}: SignOutButtonProps) {
  const { logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await logout();
    onAfter?.();
    if (redirectTo) navigate(redirectTo, { replace: true });
  };

  if (variant === "icon") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSignOut}
        className={className}
        aria-label={t("actions.signOut")}
        title={t("actions.signOut")}
      >
        <LogOut className="h-5 w-5" />
      </Button>
    );
  }

  if (variant === "inline") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        className={cn("text-muted-foreground hover:text-foreground", className)}
        aria-label={t("actions.signOut")}
      >
        <LogOut className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">{t("actions.signOut")}</span>
      </Button>
    );
  }

  // "row" — sidebar drawer footer.
  return (
    <button
      onClick={handleSignOut}
      className={cn(
        "w-full flex items-center text-sm text-muted-foreground hover:text-foreground rounded-md transition-colors",
        collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
        className,
      )}
      title={collapsed ? t("actions.signOut") : undefined}
    >
      <LogOut className="h-4 w-4" />
      {!collapsed && t("actions.signOut")}
    </button>
  );
}

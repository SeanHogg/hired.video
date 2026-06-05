import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignOutButtonProps {
  /** Icon-only ghost button — e.g. the mobile top bar. */
  iconOnly?: boolean;
  /** Sidebar collapsed rail: center the icon and surface the label via tooltip. */
  collapsed?: boolean;
  /** Runs after sign-out (e.g. close the drawer). */
  onAfter?: () => void;
  className?: string;
}

/**
 * Single source of truth for the sign-out control. Owns the
 * `useAuth().logout` call so every surface (sidebar drawer, mobile top bar)
 * shares one implementation rather than re-wiring logout per call site.
 */
export function SignOutButton({
  iconOnly,
  collapsed,
  onAfter,
  className,
}: SignOutButtonProps) {
  const { logout } = useAuth();
  const { t } = useTranslation();

  const handleSignOut = () => {
    logout();
    onAfter?.();
  };

  if (iconOnly) {
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

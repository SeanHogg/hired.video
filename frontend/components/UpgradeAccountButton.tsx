import { ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { roleUtils } from "@/lib/role-utils";
import { cn } from "@/lib/utils";

interface UpgradeAccountButtonProps {
  className?: string;
  fullWidth?: boolean;
  /** Render as an icon-only button (used in the collapsed sidebar). */
  collapsed?: boolean;
  onNavigate?: () => void;
}

export function UpgradeAccountButton({
  className,
  fullWidth = false,
  collapsed = false,
  onNavigate,
}: UpgradeAccountButtonProps) {
  const { isAuthenticated, user } = useAuth();
  // Live plan from the API (resolver-applied so admin overrides take effect
  // immediately) — was previously read off `user.subscription`, which is
  // a denormalised auth-context field that goes stale until next login.
  const { isPro, loading } = useSubscription();
  const { t } = useTranslation();

  const eligible =
    isAuthenticated &&
    !!user &&
    !loading &&
    !isPro &&
    !roleUtils.isAdmin(user.role) &&
    !roleUtils.isSuperAdmin(user.role);

  if (!eligible) return null;

  const label = t("actions.upgrade");

  if (collapsed) {
    return (
      <Link
        to="/pricing"
        onClick={onNavigate}
        className={cn("block", className)}
        title={label}
        aria-label={label}
      >
        <Button
          size="icon"
          className="w-full bg-primary hover:bg-primary/90"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  return (
    <Link
      to="/pricing"
      onClick={onNavigate}
      className={cn(fullWidth && "block", className)}
    >
      <Button
        className={cn(
          "font-medium bg-primary hover:bg-primary/90",
          fullWidth && "w-full",
        )}
      >
        {label}
      </Button>
    </Link>
  );
}

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { roleUtils } from "@/lib/role-utils";
import { cn } from "@/lib/utils";

interface UpgradeAccountButtonProps {
  className?: string;
  fullWidth?: boolean;
  onNavigate?: () => void;
}

export function UpgradeAccountButton({
  className,
  fullWidth = false,
  onNavigate,
}: UpgradeAccountButtonProps) {
  const { isAuthenticated, user } = useAuth();
  const { t } = useTranslation();

  const eligible =
    isAuthenticated &&
    !!user &&
    (!user.subscription || user.subscription === "free") &&
    !roleUtils.isAdmin(user.role) &&
    !roleUtils.isSuperAdmin(user.role);

  if (!eligible) return null;

  return (
    <Link
      to="/pricing"
      onClick={onNavigate}
      className={cn(fullWidth && "block", className)}
    >
      <Button
        className={cn(
          "bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 font-medium",
          fullWidth && "w-full",
        )}
      >
        {t("actions.upgrade")}
      </Button>
    </Link>
  );
}

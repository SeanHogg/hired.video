import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AuthButtonsProps {
  orientation?: "horizontal" | "vertical";
  onNavigate?: () => void;
  className?: string;
}

export function AuthButtons({
  orientation = "horizontal",
  onNavigate,
  className,
}: AuthButtonsProps) {
  const { t } = useTranslation();
  const isVertical = orientation === "vertical";
  const linkClass = isVertical ? "block" : undefined;
  const buttonWidth = isVertical ? "w-full" : undefined;

  return (
    <div
      className={cn(
        "flex",
        isVertical ? "flex-col space-y-2" : "items-center space-x-4",
        className,
      )}
    >
      <Link to="/login" onClick={onNavigate} className={linkClass}>
        <Button
          variant="ghost"
          className={cn(
            "bg-accent hover:bg-accent/80 font-medium",
            buttonWidth,
          )}
        >
          {t("actions.signIn")}
        </Button>
      </Link>
      <Link to="/signup" onClick={onNavigate} className={linkClass}>
        <Button
          className={cn(
            "bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 transition-opacity font-medium",
            buttonWidth,
          )}
        >
          {t("actions.getStarted")}
        </Button>
      </Link>
    </div>
  );
}

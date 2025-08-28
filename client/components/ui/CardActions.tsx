import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CardAction {
  label: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: React.ComponentType<{ className?: string }>;
  // eslint-disable-next-line no-unused-vars
  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
}

interface CardActionsProps {
  actions: CardAction[];
  className?: string;
  layout?: "horizontal" | "vertical" | "space-between" | "center";
  gap?: "sm" | "md" | "lg";
}

/**
 * CardActions - Standardized card footer component for action buttons
 * 
 * Provides:
 * - Consistent button layouts and spacing
 * - Multiple layout options (horizontal, vertical, space-between, center)
 * - Icon support for buttons
 * - Loading and disabled states
 * - Event propagation handling (stops card click events)
 */
export function CardActions({ 
  actions, 
  className = "",
  layout = "space-between",
  gap = "md"
}: CardActionsProps) {
  if (actions.length === 0) {
    return null;
  }

  const layoutStyles = {
    horizontal: "flex items-center",
    vertical: "flex flex-col",
    "space-between": "flex items-center justify-between",
    center: "flex items-center justify-center"
  };

  const gapStyles = {
    sm: "gap-1",
    md: "gap-2", 
    lg: "gap-4"
  };

  return (
    <div className={cn(
      "p-4 bg-background border-t border-border",
      layoutStyles[layout],
      gapStyles[gap],
      className
    )}>
      {actions.map((action, index) => (
        <Button
          key={index}
          variant={action.variant || "outline"}
          size={action.size || "sm"}
          disabled={action.disabled || action.loading}
          onClick={(e) => {
            e.stopPropagation(); // Prevent card click events
            action.onClick(e);
          }}
          className={cn(
            action.icon && "gap-2",
            layout === "vertical" && "w-full"
          )}
        >
          {action.loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            action.icon && <action.icon className="w-4 h-4" />
          )}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

export default CardActions;

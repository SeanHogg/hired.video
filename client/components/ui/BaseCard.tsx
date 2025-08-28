import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface BaseCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  variant?: "default" | "elevated" | "outlined";
}

/**
 * BaseCard - Foundational card component with consistent styling and behavior
 * 
 * Provides:
 * - Consistent hover effects and transitions
 * - Standardized spacing and borders
 * - Click handling with proper cursor states
 * - Multiple visual variants
 */
export function BaseCard({ 
  children, 
  className = "", 
  hover = true, 
  onClick,
  variant = "default"
}: BaseCardProps) {
  const baseStyles = "relative transition-all duration-300";
  
  const variantStyles = {
    default: "border",
    elevated: "border shadow-sm",
    outlined: "border-2"
  };

  const hoverStyles = hover ? {
    default: "hover:shadow-lg hover:border-primary/30",
    elevated: "hover:shadow-xl hover:border-primary/30", 
    outlined: "hover:shadow-md hover:border-primary/50"
  } : {
    default: "",
    elevated: "",
    outlined: ""
  };

  const interactiveStyles = onClick ? "cursor-pointer" : "";

  return (
    <Card 
      className={cn(
        baseStyles,
        variantStyles[variant],
        hoverStyles[variant],
        interactiveStyles,
        className
      )}
      onClick={onClick}
    >
      {children}
    </Card>
  );
}

export default BaseCard;

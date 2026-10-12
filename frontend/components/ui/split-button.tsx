/**
 * SplitButton — primary action button + chevron-trigger dropdown grouped
 * as a single visual control. Shares inner-edge corners so the cluster
 * reads as one button.
 *
 * Used by Studio's SaveButton and the resume Template/Export controls;
 * extract here so the geometry (rounded-r-none / rounded-l-none / shared
 * border) stays consistent everywhere.
 *
 * Usage:
 *   <SplitButton
 *     label="Export"
 *     icon={Download}
 *     onPrimary={handlePdf}             // optional: omit to make primary open the menu
 *     dropdownAlign="end"
 *     menuClassName="w-72"
 *   >
 *     <DropdownMenuItem>...</DropdownMenuItem>
 *   </SplitButton>
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SplitButtonProps {
  /** Text shown on the primary (left) button. */
  label: React.ReactNode;
  /** Icon component (lucide-react) shown on the primary button. */
  icon?: React.ComponentType<{ className?: string }>;
  /** Primary action. If omitted, clicking the primary half also opens the dropdown. */
  onPrimary?: () => void;
  /** Dropdown items — pass DropdownMenuItem / DropdownMenuLabel / DropdownMenuSeparator children. */
  children: React.ReactNode;
  /** Visual variant for both buttons. Defaults to "outline" to match the
   *  resume header; use "default" for primary actions. */
  variant?: "default" | "outline" | "secondary" | "ghost";
  /** Button size. Defaults to "sm". */
  size?: "sm" | "default" | "lg";
  /** Disable both halves together. */
  disabled?: boolean;
  /** Tooltip text on the primary button. */
  primaryTitle?: string;
  /** Aria label for the chevron button. */
  chevronLabel?: string;
  /** Additional classes for the wrapper. */
  className?: string;
  /** Additional classes for the primary button. */
  primaryClassName?: string;
  /** Dropdown menu alignment. */
  dropdownAlign?: "start" | "center" | "end";
  /** Dropdown menu width / extra classes. */
  menuClassName?: string;
}

export function SplitButton({
  label,
  icon: Icon,
  onPrimary,
  children,
  variant = "outline",
  size = "sm",
  disabled = false,
  primaryTitle,
  chevronLabel = "More options",
  className,
  primaryClassName,
  dropdownAlign = "end",
  menuClassName,
}: SplitButtonProps) {
  // When no primary action is provided, the left half also opens the
  // dropdown — control open state ourselves so both halves can toggle it.
  const [open, setOpen] = React.useState(false);
  const primaryOpensMenu = !onPrimary;

  const handlePrimaryClick = () => {
    if (primaryOpensMenu) setOpen((v) => !v);
    else onPrimary?.();
  };

  return (
    <div className={cn("inline-flex", className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn("rounded-r-none", primaryClassName)}
        disabled={disabled}
        onClick={handlePrimaryClick}
        title={primaryTitle}
      >
        {Icon && <Icon className="w-4 h-4 mr-1" />}
        {label}
      </Button>
      <DropdownMenu
        open={primaryOpensMenu ? open : undefined}
        onOpenChange={primaryOpensMenu ? setOpen : undefined}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size={size}
            variant={variant}
            className="rounded-l-none border-l border-border/60 px-2"
            disabled={disabled}
            aria-label={chevronLabel}
            title={chevronLabel}
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={dropdownAlign} className={menuClassName}>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

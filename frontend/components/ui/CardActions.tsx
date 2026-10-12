import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import ShareMenu, { ShareSubMenu } from "@/components/share/ShareMenu";
import type { SharePayload } from "@shared/social-share";

interface CardAction {
  label: string;
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  size?: "default" | "sm" | "lg" | "icon";
  icon?: React.ComponentType<{ className?: string }>;

  onClick: (event: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  /** When set, this action renders as the full social ShareMenu instead of a
   *  plain button/menu-item (LinkedIn / X / … / copy link / native). */
  share?: SharePayload;
}

interface CardActionsProps {
  actions: CardAction[];
  className?: string;
  layout?: "horizontal" | "vertical" | "space-between" | "center";
  gap?: "sm" | "md" | "lg";
  /**
   * Extra dropdown items appended after the regular overflow actions,
   * separated by a divider. Use this for inline sub-menus (e.g. AddToListMenu)
   * that don't fit the simple {label, onClick} action shape.
   */
  extraMenuItems?: React.ReactNode;
}

/**
 * CardActions - Standardized card footer component
 *
 * Renders the primary action as a visible button on the left and collapses
 * all remaining actions into an ellipsis (⋯) dropdown on the right.
 * This mirrors the proven ResumeCard pattern across all card types.
 */
export function CardActions({
  actions,
  className = "",
  extraMenuItems,
}: CardActionsProps) {
  if (actions.length === 0 && !extraMenuItems) return null;

  // Primary action is the first one — rendered as a visible button.
  const primary = actions[0];
  // Everything else goes into the ellipsis dropdown.
  const overflow = actions.slice(1);
  const hasOverflow = overflow.length > 0 || Boolean(extraMenuItems);

  return (
    <div
      className={cn(
        "p-4 bg-background border-t border-border flex items-center justify-between gap-2",
        className,
      )}
    >
      {/* Primary action — a share action becomes the full social ShareMenu;
          everything else stays a plain button. */}
      {primary.share ? (
        <ShareMenu
          variant={primary.variant === "default" ? "outline" : "ghost"}
          size={primary.size === "icon" || primary.size === "lg" ? "default" : (primary.size ?? "sm")}
          align="start"
          {...primary.share}
        />
      ) : (
        <Button
          variant={primary.variant || "outline"}
          size={primary.size || "sm"}
          disabled={primary.disabled || primary.loading}
          onClick={(e) => {
            e.stopPropagation();
            primary.onClick(e);
          }}
          className={cn(primary.icon && "gap-2")}
        >
          {primary.loading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            primary.icon && <primary.icon className="w-4 h-4" />
          )}
          {primary.label}
        </Button>
      )}

      {/* Overflow actions → ellipsis dropdown */}
      {hasOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map((action, index) =>
              action.share ? (
                // Share action expands into a "Share ▸" submenu of social
                // targets (LinkedIn / X / … / copy link / native).
                <ShareSubMenu key={index} {...action.share} />
              ) : (
                <DropdownMenuItem
                  key={index}
                  disabled={action.disabled || action.loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick(e as unknown as React.MouseEvent);
                  }}
                >
                  {action.icon && <action.icon className="w-4 h-4 mr-2" />}
                  {action.label}
                </DropdownMenuItem>
              ),
            )}
            {extraMenuItems && overflow.length > 0 && <DropdownMenuSeparator />}
            {extraMenuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export default CardActions;

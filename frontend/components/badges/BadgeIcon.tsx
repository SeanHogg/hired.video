/**
 * Visual graphic for a badge. Maps the catalog's `iconKey` (string) to a
 * Lucide icon component so the badge wall, sidebar pill, and unlock
 * toast all use the same artwork.
 *
 * Unknown keys fall back to the Trophy icon so a future catalog row
 * never renders blank.
 */

import type { LucideIcon } from "lucide-react";
import {
  Award,
  Check,
  CreditCard,
  Crown,
  Flame,
  Gift,
  Megaphone,
  Send,
  Shield,
  Sparkles,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BadgeTier = "bronze" | "silver" | "gold" | string;

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  check: Check,
  credit_card: CreditCard,
  crown: Crown,
  flame: Flame,
  gift: Gift,
  megaphone: Megaphone,
  send: Send,
  shield: Shield,
  sparkles: Sparkles,
  star: Star,
  trophy: Trophy,
  zap: Zap,
};

/** Single SSoT for badge tier styling — used by the gallery card AND
 *  the toast preview. Returning a className lets every caller compose
 *  with their own layout classes without re-declaring the gradient. */
export function tierGradient(tier: BadgeTier, earned: boolean): string {
  if (!earned) return "from-muted to-muted text-muted-foreground";
  switch (tier) {
    case "gold":
      return "from-amber-400 to-yellow-600 text-white";
    case "silver":
      return "from-slate-300 to-slate-500 text-white";
    case "bronze":
    default:
      return "from-orange-400 to-orange-700 text-white";
  }
}

export interface BadgeIconProps {
  iconKey: string | null | undefined;
  tier: BadgeTier;
  earned: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_PX: Record<NonNullable<BadgeIconProps["size"]>, { box: string; icon: string }> = {
  sm: { box: "h-8 w-8", icon: "h-4 w-4" },
  md: { box: "h-12 w-12", icon: "h-6 w-6" },
  lg: { box: "h-16 w-16", icon: "h-8 w-8" },
};

export function BadgeIcon({
  iconKey,
  tier,
  earned,
  size = "md",
  className,
}: BadgeIconProps) {
  const Icon = ICONS[iconKey ?? ""] ?? Trophy;
  const sz = SIZE_PX[size];
  return (
    <div
      className={cn(
        "rounded-full bg-gradient-to-br flex items-center justify-center shadow",
        sz.box,
        tierGradient(tier, earned),
        !earned && "opacity-60",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className={sz.icon} />
    </div>
  );
}

// WishlistButton — a self-gating heart toggle for any wishlistable entity
// (courses today; any LIST_ENTITY_TYPE tomorrow). Decides its own
// visibility: renders nothing for signed-out viewers, so consumers can drop
// it onto a card without threading an `isAuthenticated` prop through.
//
//   <WishlistButton entityType="course" entityId={course.id} />
//
// Backed by the canonical per-user wishlist list (see useWishlist).

import { Heart } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/lib/hooks/useWishlist";
import type { ListEntityType } from "@/lib/services/lists-service";

interface WishlistButtonProps {
  entityType: ListEntityType;
  entityId: string;
  /** Show a "Save"/"Saved" text label next to the heart. Default icon-only. */
  showLabel?: boolean;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline";
  className?: string;
}

export default function WishlistButton({
  entityType,
  entityId,
  showLabel = false,
  size = "icon",
  variant = "ghost",
  className,
}: WishlistButtonProps) {
  const { t } = useTranslation();
  const { isAuthenticated, isWishlisted, toggle, isToggling } =
    useWishlist(entityType);

  // Self-gating: signed-out viewers don't get a wishlist.
  if (!isAuthenticated) return null;

  const saved = isWishlisted(entityId);
  const actionLabel = saved
    ? t("wishlist.remove")
    : t("wishlist.add");

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? "sm" : size}
      disabled={isToggling}
      aria-pressed={saved}
      aria-label={actionLabel}
      title={actionLabel}
      className={cn(showLabel && "gap-2", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(entityId);
      }}
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-colors",
          saved ? "fill-rose-500 text-rose-500" : "text-muted-foreground",
        )}
      />
      {showLabel && <span>{saved ? t("labels.saved") : t("actions.save")}</span>}
    </Button>
  );
}

/**
 * MenuItemCount — the trailing count badge on a dropdown-menu row (inbox
 * unread, cart items). One component so every menu row caps, styles and
 * announces its count identically.
 *
 * Self-gating: renders nothing at zero, so callers drop it in unconditionally.
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Counts above this render as "99+" — a menu row has no space for more. */
const MAX_COUNT = 99;

export function formatMenuCount(count: number): string {
  return count > MAX_COUNT ? `${MAX_COUNT}+` : String(count);
}

export function MenuItemCount({
  count,
  className,
}: {
  count: number;
  className?: string;
}): JSX.Element | null {
  if (count <= 0) return null;
  return (
    <Badge
      variant="destructive"
      className={cn("ml-auto h-5 min-w-[20px] justify-center px-1.5 text-[11px]", className)}
    >
      {formatMenuCount(count)}
    </Badge>
  );
}

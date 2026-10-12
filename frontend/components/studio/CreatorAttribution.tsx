/**
 * CreatorAttribution — a small "by <creator>" chip linking to the
 * creator's public profile, given only a user id.
 *
 * Marketplace template surfaces (preview page, owned-template cards,
 * profile template panels) all need to credit the publishing creator but
 * the template payload carries only `creatorId` (no denormalised name /
 * avatar). Per the DRY rule this resolution lives in ONE component that
 * fetches + caches the public user via react-query, rather than each
 * surface re-fetching and re-formatting. The component self-gates: it
 * returns `null` while loading or when the user can't be resolved, so
 * callers can drop it in unconditionally.
 */

import { useQuery } from "@tanstack/react-query";
import { publicProfilePath } from "@shared/public-paths";
import { Link } from "react-router-dom";
import { userService } from "@/lib/services/user-service";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface Props {
  creatorId: string | null | undefined;
  /** Optional prefix label, e.g. "Created by". Defaults to "By". */
  label?: string;
  className?: string;
}

export default function CreatorAttribution({ creatorId, label = "By", className }: Props) {
  const { data: user } = useQuery({
    queryKey: ["public-user", creatorId],
    queryFn: () => userService.getUserById(creatorId as string),
    enabled: Boolean(creatorId),
    staleTime: 5 * 60 * 1000,
  });

  if (!creatorId || !user) return null;

  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "Creator";
  const href = publicProfilePath(user.slug || user.id || creatorId);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      to={href}
      className={`inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors ${className ?? ""}`}
    >
      <Avatar className="h-6 w-6">
        {user.profilePicture ? <AvatarImage src={user.profilePicture} alt={name} /> : null}
        <AvatarFallback className="text-[10px]">{initials || "?"}</AvatarFallback>
      </Avatar>
      <span>
        {label} <span className="font-medium text-foreground">{name}</span>
      </span>
    </Link>
  );
}

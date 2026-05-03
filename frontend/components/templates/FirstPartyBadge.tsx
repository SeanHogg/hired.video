// FirstPartyBadge — surfaces "Made by hired.video" on platform-shipped
// studio templates. Self-gating per the project DRY rule: the only
// callsites pass the meta in, the badge decides whether to render.
//
// Detection rules:
//   * studio-creator templates: `meta.origin.template.firstParty === true`
//     (set by the backend search route from the Hired.VIDEO Community
//     company id resolved via JobService.getHiredVideoCommunityCompanyId)
//   * studio-builtin templates: always first-party (they ship in the
//     frontend bundle as part of the platform)
//   * resume templates: never first-party
//
// Returns null when the meta isn't first-party so consumers don't have
// to guard with their own conditional.

import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  className?: string;
}

export default function FirstPartyBadge({ meta, className }: Props) {
  if (!isFirstParty(meta)) return null;
  return (
    <Badge
      variant="outline"
      className={`gap-1 border-primary/40 bg-primary/5 text-primary ${className ?? ""}`}
      title="Made by hired.video"
    >
      <Sparkles className="w-3 h-3" /> First-party
    </Badge>
  );
}

/** Single source of truth for "is this template platform-shipped?".
 *  Exported so the marketplace's "First-party only" filter pill can
 *  share the same predicate as the badge. */
export function isFirstParty(meta: TemplateMeta): boolean {
  if (meta.origin.kind === "studio-builtin") return true;
  if (meta.origin.kind === "studio-creator") {
    return Boolean(meta.origin.template.firstParty);
  }
  return false;
}

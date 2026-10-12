// FirstPartyBadge — the "hired.video" mono chip on platform-shipped
// templates. Self-gating per the project DRY rule: callsites pass the meta
// in, the badge decides whether to render.
//
// Detection rules:
//   * studio-creator templates: `meta.origin.template.firstParty === true`
//     (set by the backend search route from the Hired.VIDEO Community
//     company id resolved via JobService.getHiredVideoCommunityCompanyId)
//   * studio-builtin templates: always first-party (they ship in the
//     frontend bundle as part of the platform)
//   * resume templates: always first-party (bundled presets from
//     TEMPLATE_PRESETS — there is no user-published resume template kind)
//
// Returns null when the meta isn't first-party so consumers don't have
// to guard with their own conditional.

import { useTranslation } from "react-i18next";
import MonoChip from "@/components/templates/MonoChip";
import type { TemplateMeta } from "@/lib/templates/types";

interface Props {
  meta: TemplateMeta;
  className?: string;
  /** Appended after the label, e.g. the template version ("v1.2"). */
  suffix?: string;
  /** Short card form ("hired.video") vs. the full "By hired.video". */
  short?: boolean;
}

export default function FirstPartyBadge({ meta, className, suffix, short = false }: Props) {
  const { t } = useTranslation();
  if (!isFirstParty(meta)) return null;
  const label = t(short ? "templates.card.firstPartyChip" : "templates.byHiredVideo");
  return (
    <MonoChip className={className}>
      {suffix ? `${label} · ${suffix}` : label}
    </MonoChip>
  );
}

/** Single source of truth for "is this template platform-shipped?".
 *  Exported so the marketplace's "First-party only" filter pill can
 *  share the same predicate as the badge. */
export function isFirstParty(meta: TemplateMeta): boolean {
  if (meta.origin.kind === "studio-builtin" || meta.origin.kind === "resume") return true;
  if (meta.origin.kind === "studio-creator") {
    return Boolean(meta.origin.template.firstParty);
  }
  return false;
}

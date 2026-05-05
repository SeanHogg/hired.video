// Map an analyzer recommendation (free-form `{ category, title,
// description }` from the LLM) to the most appropriate registered
// wand tool, or return null when no wand fits.
//
// Until the analyzer prompt emits a structured `{ actionId, args }`
// per recommendation (gap register entry — see README.md), this is
// keyword pattern-matching on the title + description. Single source
// — both the page Action button and any future "auto-apply all
// quick wins" surface call the same resolver.

type WandToolId =
  | "consolidate_section_highlights"
  | "standardize_resume_dates"
  | "shorten_bullet";

interface ResolvedWand {
  toolId: WandToolId;
  /** Button label to render. Per-wand so the user knows what's about to fire. */
  label: string;
  /** `args` passed to `tool.run({ resumeId, args })`. */
  args: Record<string, unknown>;
}

interface RecommendationLike {
  category?: string;
  title: string;
  description?: string;
}

interface ResolveContext {
  /** Sample bullet text the LLM quoted, when the recommendation
   *  references one. Required by the consolidate-highlights wand. */
  matchHighlight?: string;
}

function lower(rec: RecommendationLike): { all: string; title: string } {
  const title = (rec.title ?? "").toLowerCase();
  const all = `${title} ${(rec.description ?? "").toLowerCase()} ${(rec.category ?? "").toLowerCase()}`;
  return { all, title };
}

/** Resolve a recommendation to a wand. Returns null if no wand fits
 *  the recommendation OR if the wand needs context the caller didn't
 *  supply (e.g. consolidate needs a `matchHighlight`). */
export function findWandForRecommendation(
  rec: RecommendationLike,
  ctx: ResolveContext = {},
): ResolvedWand | null {
  const { all, title } = lower(rec);

  // Date standardization — most specific match first.
  if (
    /\bdate\b/.test(all) &&
    /(format|standardiz|consistent|inconsistent|mixed|unify)/.test(all)
  ) {
    return {
      toolId: "standardize_resume_dates",
      label: "Standardize dates",
      args: {},
    };
  }

  // Consolidate duplicate / overlapping bullets. Needs an anchor bullet
  // so the matcher can find the section.
  if (
    /(duplicate|consolidate|merge|overlap|repetiti|redundan)/.test(all) &&
    /(bullet|highlight|achievement|mention|phrase|point|item)/.test(all)
  ) {
    if (!ctx.matchHighlight) return null;
    return {
      toolId: "consolidate_section_highlights",
      label: "Consolidate bullets",
      args: { matchHighlight: ctx.matchHighlight },
    };
  }

  // Shorten verbose bullets.
  if (
    /(shorten|tighten|trim|too long|verbose|concise|wordy|cut down)/.test(all) &&
    /(bullet|highlight|sentence|line|point)/.test(all)
  ) {
    if (!ctx.matchHighlight) return null;
    return {
      toolId: "shorten_bullet",
      label: "Shorten bullet",
      args: { original: ctx.matchHighlight },
    };
  }

  // Fall through — title-only check for "consolidate" / "shorten" so a
  // crisp imperative title wins even if the description is generic.
  if (/^consolidate\b/.test(title) && ctx.matchHighlight) {
    return {
      toolId: "consolidate_section_highlights",
      label: "Consolidate bullets",
      args: { matchHighlight: ctx.matchHighlight },
    };
  }
  if (/^shorten\b/.test(title) && ctx.matchHighlight) {
    return {
      toolId: "shorten_bullet",
      label: "Shorten bullet",
      args: { original: ctx.matchHighlight },
    };
  }
  if (/^standardize\b/.test(title) && /\bdate/.test(all)) {
    return {
      toolId: "standardize_resume_dates",
      label: "Standardize dates",
      args: {},
    };
  }

  return null;
}

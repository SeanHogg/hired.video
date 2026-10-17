/**
 * The render stamp (`timelineSpec._meta.bakedHash`) belongs to the hosted
 * render, not to the editor: it is written once, after the MP4 is uploaded
 * (frontend publish-render `hostRenderedVideo`). Every later save sends a
 * timeline rebuilt from the canvas WITHOUT `_meta`, which used to wipe the
 * stamp — so the next post always looked stale and re-rendered + re-uploaded
 * an unchanged video.
 *
 * Carrying the prior stamp forward is safe: freshness compares the stamp
 * with a hash of the CURRENT content (frontend baked-freshness), so an edit
 * still reads as stale; an unchanged save stays fresh.
 */
type Spec = Record<string, unknown> & { _meta?: Record<string, unknown> };

/** The render stamp a state carries (`_meta.bakedHash`), or null. */
export function bakedStampOf(spec: unknown): string | null {
  const hash = (spec as Spec | null)?._meta?.bakedHash;
  return typeof hash === "string" && hash ? hash : null;
}

/** `incoming`, with the prior render stamp when it brings none of its own. */
export function carryBakedStamp(prior: unknown, incoming: unknown): unknown {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
  if (bakedStampOf(incoming)) return incoming;
  const stamp = bakedStampOf(prior);
  if (!stamp) return incoming;
  const spec = incoming as Spec;
  return { ...spec, _meta: { ...(spec._meta ?? {}), bakedHash: stamp } };
}

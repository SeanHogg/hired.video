/**
 * The `storyboard` JSONB holds two things: a V1 VideoScript's own keys
 * (`video`, `scenes`, …) and save-draft meta under `_`-prefixed keys
 * (`_name`, `_prompt`, `_jobDescription`, `_rev`, `_slug`, …). One split,
 * shared by the public payload (which must never leak the meta) and
 * save-draft (which must carry the script forward on a meta-only save).
 */
export function storyboardScriptKeys(storyboard: unknown): Record<string, unknown> {
  if (!storyboard || typeof storyboard !== "object" || Array.isArray(storyboard)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(storyboard as Record<string, unknown>)) {
    if (!key.startsWith("_")) out[key] = value;
  }
  return out;
}

/**
 * Per-viewer memory for the create-intent resolver (lib/studio/create-intent):
 *
 *   - the intent the viewer last picked in the studio chooser (localStorage —
 *     a convenience that may come back empty, never a source of truth)
 *   - the /for/:audience page they arrived through this visit (sessionStorage
 *     — a landing signal is only fresh for the visit it came from)
 *
 * Every read and write is guarded: storage can be blocked (private windows,
 * in-app browsers) and the chooser must still render, falling back to the
 * role / default intent.
 */
import { isCreateIntent, type CreateIntent, type CreateIntentPreferences } from "@/lib/studio/create-intent";

const LAST_INTENT_KEY = "hv.createIntent.last";
const LANDING_SOURCE_KEY = "hv.createIntent.landing";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Storage blocked — the resolver falls back to role / default.
  }
}

const local = () => window.localStorage;
const session = () => window.sessionStorage;

export function readCreateIntentPreferences(): CreateIntentPreferences {
  const last = read(local, LAST_INTENT_KEY);
  return { lastIntent: isCreateIntent(last) ? last : null };
}

export function rememberCreateIntent(intent: CreateIntent): void {
  write(local, LAST_INTENT_KEY, intent);
}

/** Called by /for/:audience on arrival with the page's URL slug. */
export function rememberLandingSource(audienceSlug: string): void {
  if (audienceSlug) write(session, LANDING_SOURCE_KEY, audienceSlug);
}

export function readLandingSource(): string | null {
  return read(session, LANDING_SOURCE_KEY);
}

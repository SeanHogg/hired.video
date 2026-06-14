/**
 * Lazy loader for the bundled help content catalog (#2075).
 *
 * `lib/help/content.ts` eager-globs ~60 Markdown files, so anything that
 * STATICALLY imports it drags that payload into its chunk — and the
 * always-mounted HelpDrawer would pull it into the app-wide entry bundle.
 * To keep it out of every-page load, NOTHING imports `content.ts`
 * statically; consumers load it through this memoized dynamic import, so
 * Vite emits it as ONE separate chunk fetched only when help is actually
 * used (drawer opened, /help, /help/:slug, search, admin curation).
 *
 * `typeof import(...)` is a type-only reference (no runtime import), so this
 * module itself stays light and safe to import from the entry bundle.
 */

import { useEffect, useState } from "react";

export type HelpContentModule = typeof import("./content");

let cached: HelpContentModule | null = null;
let pending: Promise<HelpContentModule> | null = null;

/** Load (once) and memoize the help content module. */
export function loadHelpContent(): Promise<HelpContentModule> {
  if (cached) return Promise.resolve(cached);
  pending ??= import("./content").then((m) => {
    cached = m;
    return m;
  });
  return pending;
}

/** React hook: returns the help content module once loaded, else null.
 *  Components render their loading/empty state while it's null. */
export function useHelpContent(): HelpContentModule | null {
  const [mod, setMod] = useState<HelpContentModule | null>(cached);
  useEffect(() => {
    let active = true;
    // Memoized — resolves instantly when already cached.
    loadHelpContent().then((m) => {
      if (active) setMod(m);
    });
    return () => {
      active = false;
    };
  }, []);
  return mod;
}

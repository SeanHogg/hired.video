/**
 * useOwnedTemplates — every studio template the viewer owns: their own
 * published rows plus their claimed/purchased licenses, normalised into
 * `OwnedTemplate` and narrowed by the page's live search `query`.
 * Single source of truth feeding the unified Templates section — both the
 * "All" merged view and the dedicated Created/Purchased filters.
 * `enabled: false` (a deep link is redirecting) defers the fetches until the
 * page actually shows.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  studioTemplatesService,
  type LicensedStudioTemplate,
  type StudioTemplate,
} from "@/lib/services/studio-templates-service";
import type { OwnedTemplate } from "./types";

export function useOwnedTemplates(query: string, { enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const [userCreatedTemplates, setUserCreatedTemplates] = useState<StudioTemplate[]>([]);
  const [userLicensedTemplates, setUserLicensedTemplates] = useState<LicensedStudioTemplate[]>([]);
  const [userTemplatesLoading, setUserTemplatesLoading] = useState(true);

  // Load the user's own + licensed templates once the page shows. Both endpoints
  // soft-fail to an empty list — a network blip or 401 shouldn't break the
  // built-in carousel, which is the primary CTA on this page.
  useEffect(() => {
    if (!enabled) return;
    // Signed-out visitors own no templates — skip the (401-bound) fetches; the
    // built-in catalog still renders (it's static, not gated on this flag).
    if (!user) {
      setUserCreatedTemplates([]);
      setUserLicensedTemplates([]);
      setUserTemplatesLoading(false);
      return;
    }
    let cancelled = false;
    setUserTemplatesLoading(true);
    // Wrap each call in Promise.resolve().then(...) so a SYNCHRONOUS throw in a
    // service (not just a rejected promise) still funnels into `.catch` — a
    // sync throw here used to skip the `.then` and leave `loading` stuck true,
    // which froze the carousel on its skeleton forever. `.finally` guarantees
    // the flag always clears regardless of how the fetch settled.
    Promise.all([
      Promise.resolve()
        .then(() => studioTemplatesService.listMine())
        .catch(() => [] as StudioTemplate[]),
      Promise.resolve()
        .then(() => studioTemplatesService.listMyLicensedTemplates())
        .catch(() => [] as LicensedStudioTemplate[]),
    ])
      .then(([mine, licensed]) => {
        if (cancelled) return;
        setUserCreatedTemplates(mine);
        setUserLicensedTemplates(licensed);
      })
      .finally(() => {
        if (!cancelled) setUserTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, enabled]);

  // Composed list of every template the user owns — their own published
  // rows plus their claimed/purchased licenses. Sorted by most-recent so
  // the freshly-acquired template lands at the front. Search query
  // applies here so users can find a specific one without scrolling.
  const ownedTemplates = useMemo<OwnedTemplate[]>(() => {
    const q = query.trim().toLowerCase();
    const created: OwnedTemplate[] = userCreatedTemplates.map((t) => ({
      template: t,
      provenance: "created" as const,
    }));
    const licensed: OwnedTemplate[] = userLicensedTemplates.map((row) => ({
      template: row.template,
      provenance:
        row.license.source === "purchase" ? ("purchased" as const) : ("claimed" as const),
    }));
    const merged = [...created, ...licensed];
    const filtered = merged.filter(({ template: t }) => {
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
      );
    });
    filtered.sort((a, b) =>
      (b.template.updatedAt ?? "").localeCompare(a.template.updatedAt ?? ""),
    );
    return filtered;
  }, [userCreatedTemplates, userLicensedTemplates, query]);

  return { ownedTemplates, loading: userTemplatesLoading };
}

export type OwnedTemplates = ReturnType<typeof useOwnedTemplates>;

// Single source of truth for the "Use template" CTA. Every surface (cards,
// details panel, marketplace route) calls this hook; nobody reimplements
// the gating logic. Returns a stable `apply()` callback plus the labels +
// pricing the UI needs, so the caller renders one button and forwards the
// click. Self-gating extends through this hook — callers don't pass any
// canBuy / canApply booleans, the hook reads ownership + price + auth.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { resumeService } from "@/lib/services/resume-service";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import {
  studioTemplatesService,
} from "@/lib/services/studio-templates-service";
import type { VideoScript } from "@/types/video-script";
import type { ContentTemplate } from "@/components/studio/templates/catalog";
import type { TemplateMeta } from "./types";

export type ApplyAction = "use" | "buy" | "claim" | "sign-in";

export interface UseApplyTemplateResult {
  /** Imperative trigger — caller wires this to the primary CTA's onClick. */
  apply: () => Promise<void> | void;
  /** Localized button label that reflects the next action the user takes. */
  ctaLabel: string;
  /** True when the visitor already owns this template and can use it now. */
  isOwned: boolean;
  /** True for `priceCents > 0` AND not owned — exposed so cards can show
   *  a price chip; never used to branch behaviour (the apply() handler
   *  already does the right thing). */
  isPaid: boolean;
  /** While an async claim/cart op is in flight. */
  busy: boolean;
}

/** Format a cents value as a price chip ("Free" or "$3.99"). Exported so
 *  the details panel and cards can stay consistent without each importing
 *  their own formatter. */
export function priceLabel(cents: number): string {
  if (!cents || cents <= 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

/** Compute the action verb that should appear on the CTA. Pure — no React
 *  calls — so it can be reused for tests + headless contexts. */
export function nextAction(meta: TemplateMeta, opts: { isAuthed: boolean; isOwned: boolean }): ApplyAction {
  if (opts.isOwned) return "use";
  if (meta.priceCents > 0) return "buy";
  // Free creator templates need a server-side claim so the license appears
  // in the user's ledger; built-ins + free resume templates can be used
  // directly. Anonymous users get "sign-in" so we never silently send them
  // through a flow that needs auth.
  if (meta.kind === "studio-creator") {
    return opts.isAuthed ? "claim" : "sign-in";
  }
  return "use";
}

function ctaLabelFor(action: ApplyAction, meta: TemplateMeta): string {
  switch (action) {
    case "use":
      return meta.kind === "resume" ? "Use this template" : "Use this template";
    case "buy":
      return `Buy — ${priceLabel(meta.priceCents)}`;
    case "claim":
      return "Use this template";
    case "sign-in":
      return "Sign in to use";
  }
}

/** URL the visitor lands on AFTER signing in if they triggered "Use this
 *  template" while anonymous. Resume kind deep-links to the resume that
 *  receives the template; studio kinds bounce back to the marketplace
 *  preview page so the now-authenticated visitor can press Apply again
 *  and trigger the server-side draft creation (no more /studio/new
 *  bouncer — drafts are minted on the server and we navigate straight
 *  to /studio/<real-id>). */
export function applyHrefFor(meta: TemplateMeta, masterResumeId?: string | null): string {
  switch (meta.origin.kind) {
    case "resume":
      return masterResumeId
        ? `/resumes/${masterResumeId}?template=${encodeURIComponent(meta.slug)}`
        : `/resumes?template=${encodeURIComponent(meta.slug)}`;
    case "studio-builtin":
    case "studio-creator":
      return `/marketplace/templates/${encodeURIComponent(meta.slug)}`;
  }
}

export function useApplyTemplate(meta: TemplateMeta | null): UseApplyTemplateResult {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();
  // Studio kinds mint their draft server-side and navigate straight to
  // /studio/<real-id> — no more /studio/new bouncer. Wiring through the
  // shared hook means the carousel, the marketplace CTA, and the wizard
  // all hit the same saveDraft pipeline (last-used template memory +
  // editor-preference dispatch + error toast).
  const { create, creating } = useCreateStudioDraft();

  const [owned, setOwned] = useState(() =>
    meta ? isTemplateUnlocked(meta.slug, kindToUnlockKind(meta.kind)) : false,
  );
  const [busy, setBusy] = useState(false);

  // Re-check ownership when an unlock event fires anywhere in the app. Keeps
  // the CTA in sync after checkout completes or a free claim resolves.
  useEffect(() => {
    if (!meta) return;
    const sync = () => setOwned(isTemplateUnlocked(meta.slug, kindToUnlockKind(meta.kind)));
    sync();
    window.addEventListener("hired:template-unlocked", sync);
    window.addEventListener("hired:template-unlocks-refreshed", sync);
    return () => {
      window.removeEventListener("hired:template-unlocked", sync);
      window.removeEventListener("hired:template-unlocks-refreshed", sync);
    };
  }, [meta?.slug, meta?.kind]);

  const apply = useCallback(async () => {
    if (!meta) return;
    const action = nextAction(meta, { isAuthed: isAuthenticated, isOwned: owned });

    if (action === "sign-in") {
      navigate(`/login?next=${encodeURIComponent(applyHrefFor(meta))}`);
      return;
    }

    if (action === "buy") {
      addItem({
        id: `template:${meta.slug}`,
        name: meta.name,
        price: meta.priceCents / 100,
        type: "template",
      });
      openCart();
      return;
    }

    if (action === "claim") {
      // Creator-published free template — needs a server-side license grant
      // so the row appears in /api/studio/templates/licenses/me. After the
      // claim resolves we mint the draft via useCreateStudioDraft so the
      // user lands on /studio/<real-id> instead of /studio/new.
      setBusy(true);
      try {
        const sourceId =
          meta.origin.kind === "studio-creator" ? meta.origin.template.id : meta.slug;
        await studioTemplatesService.claimFree(sourceId);
        setOwned(true);
        await openInStudio(meta);
      } finally {
        setBusy(false);
      }
      return;
    }

    // action === "use". Resume kind looks up the master resume so the
    // destination opens it with the template applied; studio kinds mint
    // a draft server-side and route directly to /studio/<real-id> via
    // useCreateStudioDraft (replaces the old /studio?contentTemplate= →
    // /studio/new bouncer entirely).
    if (meta.origin.kind === "resume") {
      let masterResumeId: string | null = null;
      if (isAuthenticated) {
        try {
          const list = await resumeService.getUserResumes();
          const master = (list ?? []).find(
            (r: any) => r.isMaster === true || r.IsMaster === true,
          ) as any | undefined;
          masterResumeId = master?.id ?? master?.Id ?? null;
        } catch {
          masterResumeId = null;
        }
      }
      navigate(applyHrefFor(meta, masterResumeId));
      return;
    }

    await openInStudio(meta);
  }, [meta, isAuthenticated, owned, addItem, openCart, navigate, create]);

  // Studio-kind dispatcher — picks the right useCreateStudioDraft input
  // for built-in vs creator templates and lets the hook do saveDraft +
  // navigate to /studio/<real-id>. Resume kind never gets here.
  async function openInStudio(m: TemplateMeta): Promise<void> {
    if (m.origin.kind === "studio-builtin") {
      await create({ kind: "template", templateId: m.origin.def.id as ContentTemplate });
      return;
    }
    if (m.origin.kind === "studio-creator") {
      const script = m.origin.template.videoScript as VideoScript | null | undefined;
      if (!script) {
        // Creator hasn't published canvas content yet — fall back to the
        // marketplace preview page so the user isn't dumped into a
        // half-broken editor (same defensive copy StudioEditorV2 uses).
        navigate(`/marketplace/templates/${encodeURIComponent(m.slug)}`);
        return;
      }
      await create({ kind: "script", script, name: m.name });
    }
  }

  if (!meta) {
    return { apply, ctaLabel: "Use this template", isOwned: false, isPaid: false, busy: false };
  }

  const action = nextAction(meta, { isAuthed: isAuthenticated, isOwned: owned });
  return {
    apply,
    ctaLabel: ctaLabelFor(action, meta),
    isOwned: owned,
    isPaid: meta.priceCents > 0 && !owned,
    busy: busy || creating,
  };
}

/** Map TemplateKind to the legacy template-unlocks `TemplateKind` (which
 *  doesn't distinguish builtin vs. creator). Both studio kinds share the
 *  same ledger; resume keeps its own. */
function kindToUnlockKind(kind: TemplateMeta["kind"]): "resume" | "studio" {
  return kind === "resume" ? "resume" : "studio";
}

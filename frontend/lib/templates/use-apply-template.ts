// Single source of truth for the "Use template" CTA. Every surface (cards,
// details panel, marketplace route) calls this hook; nobody reimplements
// the gating logic. Returns a stable `apply()` callback plus the labels +
// pricing the UI needs, so the caller renders one button and forwards the
// click. Self-gating extends through this hook — callers don't pass any
// canBuy / canApply booleans, the hook reads ownership + price + auth.
//
// What "use" opens depends on what the template MAKES, not where it comes
// from: a résumé template — built-in preset or creator studio template —
// opens the career kit wearing it (the visitor's master résumé, or a new
// kit); every other template mints a studio draft.

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { templatePriceLabel } from "./price";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { resumeService } from "@/lib/services/resume-service";
import { isTemplateUnlocked } from "@/lib/template-unlocks";
import { useCreateStudioDraft } from "@/lib/studio/use-create-studio-draft";
import { studioTemplatesService } from "@/lib/services/studio-templates-service";
import { studioTemplateStart } from "@/lib/studio/studio-template-start";
import type { ContentTemplate } from "@/lib/studio/templates/catalog";
import { isResumeTemplate, type TemplateMeta } from "./types";
import { applyHrefFor, cartIdFor, nextAction, unlockKeyFor, type ApplyAction } from "./apply-targets";

export { applyHrefFor, nextAction, type ApplyAction } from "./apply-targets";

export interface UseApplyTemplateResult {
  /** Imperative trigger — caller wires this to the primary CTA's onClick. */
  apply: () => Promise<void> | void;
  /** The resolved next action. Exposed so CTAs can safely override the label
   *  only on the free "use"/"claim" path (and never replace "Buy" / "Sign
   *  in", where a generic label would mislead the user). */
  action: ApplyAction;
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

function ctaLabelFor(t: TFunction, locale: string, action: ApplyAction, meta: TemplateMeta): string {
  switch (action) {
    case "use":
    case "claim":
      return t("templates.cta.use");
    case "buy":
      return t("templates.cta.buy", { price: templatePriceLabel(t, meta.priceCents, locale) });
    case "sign-in":
      return t("templates.cta.signIn");
  }
}

/** The signed-in visitor's master résumé id, or null. */
async function findMasterResumeId(): Promise<string | null> {
  try {
    const list = await resumeService.getUserResumes();
    return list.find((r) => r.isMaster === true)?.id ?? null;
  } catch {
    return null;
  }
}

export function useApplyTemplate(meta: TemplateMeta | null): UseApplyTemplateResult {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();
  // Studio kinds mint their draft server-side and navigate straight to
  // /studio/<real-id>. Wiring through the shared hook means the carousel,
  // the marketplace CTA, and the wizard all hit the same saveDraft pipeline.
  const { create, creating } = useCreateStudioDraft();

  const isOwnedNow = (m: TemplateMeta) => {
    const key = unlockKeyFor(m);
    return isTemplateUnlocked(key.id, key.kind);
  };
  const [owned, setOwned] = useState(() => (meta ? isOwnedNow(meta) : false));
  const [busy, setBusy] = useState(false);

  // Re-check ownership when an unlock event fires anywhere in the app. Keeps
  // the CTA in sync after checkout completes or a free claim resolves.
  useEffect(() => {
    if (!meta) return;
    const sync = () => setOwned(isOwnedNow(meta));
    sync();
    window.addEventListener("hired:template-unlocked", sync);
    window.addEventListener("hired:template-unlocks-refreshed", sync);
    return () => {
      window.removeEventListener("hired:template-unlocked", sync);
      window.removeEventListener("hired:template-unlocks-refreshed", sync);
    };
  }, [meta?.slug, meta?.kind]);

  // Open a template the visitor may use: résumé → the kit wearing it;
  // anything else → a new studio draft.
  async function open(m: TemplateMeta): Promise<void> {
    if (isResumeTemplate(m)) {
      const masterResumeId = isAuthenticated ? await findMasterResumeId() : null;
      navigate(applyHrefFor(m, masterResumeId));
      return;
    }
    if (m.origin.kind === "studio-builtin") {
      await create({ kind: "template", templateId: m.origin.def.id as ContentTemplate });
      return;
    }
    if (m.origin.kind === "studio-creator") {
      const start = studioTemplateStart({ ...m.origin.template, name: m.name });
      if (!start) {
        // Creator hasn't published canvas content yet — stay on the
        // marketplace preview page instead of a half-broken editor.
        navigate(`/marketplace/templates/${encodeURIComponent(m.slug)}`);
        return;
      }
      await create(start);
    }
  }

  const apply = useCallback(async () => {
    if (!meta) return;
    const action = nextAction(meta, { isAuthed: isAuthenticated, isOwned: owned });

    if (action === "sign-in") {
      navigate(`/login?next=${encodeURIComponent(applyHrefFor(meta))}`);
      return;
    }

    if (action === "buy") {
      addItem({
        id: cartIdFor(meta),
        name: meta.name,
        price: meta.priceCents / 100,
        type: "template",
      });
      openCart();
      return;
    }

    if (action === "claim") {
      // Creator-published free template — a server-side license grant so the
      // row appears in /api/studio/templates/licenses/me, then open it.
      setBusy(true);
      try {
        await studioTemplatesService.claimFree(unlockKeyFor(meta).id);
        setOwned(true);
        await open(meta);
      } finally {
        setBusy(false);
      }
      return;
    }

    await open(meta);
  }, [meta, isAuthenticated, owned, addItem, openCart, navigate, create]);

  if (!meta) {
    return { apply, action: "use", ctaLabel: t("templates.cta.use"), isOwned: false, isPaid: false, busy: false };
  }

  const action = nextAction(meta, { isAuthed: isAuthenticated, isOwned: owned });
  return {
    apply,
    action,
    ctaLabel: ctaLabelFor(t, i18n.language, action, meta),
    isOwned: owned,
    isPaid: meta.priceCents > 0 && !owned,
    busy: busy || creating,
  };
}

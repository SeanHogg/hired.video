/**
 * The /studio deep-link contract. Each entry point (`?projectId=`, the edit
 * params, `?contentTemplate=`, `?template=`, `?studioTemplate=`, the blank
 * seeds) is ONE `EntryHandler` in the table (`./table.ts`): `matches` reads
 * the URL, `run` does the async work and resolves to where to go — or to a
 * failure, after which the landing page clears its loading shell and drops
 * the deep-link params so a refresh doesn't retry.
 */
import type { TFunction } from "i18next";
import type { useToast } from "@/hooks/use-toast";
import type { StudioProject } from "@/lib/services/studio-service";
import type { CreateStudioDraft } from "../types";

export type ToastFn = ReturnType<typeof useToast>["toast"];

export interface EntryContext {
  params: URLSearchParams;
  /** The page's shared `create` (minted with `skipNavigate: true`). */
  create: CreateStudioDraft;
  t: TFunction;
  toast: ToastFn;
}

/** `navigate` = replace-navigate there; `failed` = nothing to open (any
 *  toast was already shown by the handler). */
export type EntryOutcome = { type: "navigate"; to: string } | { type: "failed" };

export interface EntryHandler {
  /** Stable name — for tests and debugging only. */
  id: string;
  matches: (params: URLSearchParams) => boolean;
  run: (ctx: EntryContext) => Promise<EntryOutcome>;
}

export const FAILED: EntryOutcome = { type: "failed" };

// UI-state seed params the editor reads from `searchParams` (not from
// project state). When the chooser forwards a deep-link to the freshly-
// minted /studio/<id> URL, these survive as query params so the editor
// honours them on first paint. Non-listed params are dropped.
//
// `contentTemplate` is forwarded so the editor can resolve `mediaKind`
// synchronously at mount via the catalog lookup — eliminates the
// "flash of video defaults" before the post-load effect kicks in for
// audio-only kinds (podcast / voice). Server is still SoT for
// `studio_projects.media_kind`; this is a UI hint.
const EDITOR_FORWARDED_PARAMS = ["capture", "contentTemplate"] as const;

/** Where a minted / found project opens: `/studio/<id>` plus the whitelisted
 *  editor UI-state params. A null project (create failed, or the create seam
 *  routed elsewhere itself) is a failure — the runner tells the two apart. */
export function projectOutcome(
  project: StudioProject | null,
  params: URLSearchParams,
): EntryOutcome {
  if (!project) return FAILED;
  const forwarded = new URLSearchParams();
  for (const key of EDITOR_FORWARDED_PARAMS) {
    const v = params.get(key);
    if (v) forwarded.set(key, v);
  }
  const qs = forwarded.toString();
  return {
    type: "navigate",
    to: `/studio/${encodeURIComponent(project.id)}${qs ? `?${qs}` : ""}`,
  };
}

/** The shared destructive toast every handler's catch shows. */
export function toastEntryError(ctx: EntryContext, titleKey: string, err: unknown): void {
  ctx.toast({
    title: ctx.t(titleKey),
    description: err instanceof Error ? err.message : ctx.t("errors.unknownErrorAdmin"),
    variant: "destructive",
  });
}

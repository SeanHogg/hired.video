"use client";

/**
 * HookOptimizerBody — the inner UI of the hook optimizer, extracted so
 * it can be mounted directly inside any host shell (a Dialog in v1 via
 * HookOptimizerDialog, or a Sheet in v2's Actions panel) without
 * nesting modals.
 *
 * Self-gating: if there is no project id or the storyboard has no
 * scenes with text, the body shows a helpful empty state instead of
 * letting the user fire an obviously-empty backend call.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Zap, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  optimizeHook,
  type HookVariant,
  type HookOptimizerResult,
} from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  /** Free-form storyboard passed straight to the backend. v1 sends a
   *  VideoScript; v2 sends a `{scenes: [{id,title,text}]}` slice of
   *  CanvasState. We only inspect `scenes[*].text` for the empty-state
   *  guard. */
  storyboard: unknown;
  /** Patches scene 0 with the selected variant. */
  onApply: (sceneZeroPatch: { title?: string; subtitle?: string; text?: string }) => void;
  /** Optional — host shell may want to close itself after apply. */
  onClose?: () => void;
}

export default function HookOptimizerBody({ projectId, storyboard, onApply, onClose }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HookOptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasUsableScenes = useMemo(() => sceneHasText(storyboard), [storyboard]);

  async function handleRun() {
    if (!projectId || !hasUsableScenes) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await optimizeHook({ projectId, storyboard });
      setResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("studio.hookOptimizer.errorFallback");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handlePick(v: HookVariant) {
    onApply({ title: v.title, subtitle: v.subtitle, text: v.text });
    setResult(null);
    onClose?.();
  }

  if (!projectId) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Save your project first so the optimizer can attach to it.
      </div>
    );
  }

  if (!hasUsableScenes) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Add a text or heading widget to at least one scene — the
        optimizer rewrites the hook from your existing copy.
      </div>
    );
  }

  return (
    <>
      {!result && !loading && (
        <div className="flex justify-center py-6">
          <Button onClick={handleRun}>
            <Zap className="w-4 h-4 mr-2" /> {t("studio.hookOptimizer.analyse")}
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border bg-muted/30 p-2.5">
            <div className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-1">
              {t("studio.hookOptimizer.diagnosis")}
            </div>
            <p className="text-xs">{result.diagnosis}</p>
            {result.retention.sampleSize > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {t("studio.hookOptimizer.retentionStats", {
                  views: result.retention.sampleSize,
                  pct: result.retention.earlyDropPct,
                })}
                {result.retention.topDropOffSecond != null &&
                  t("studio.hookOptimizer.topDropSuffix", { sec: result.retention.topDropOffSecond })}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {result.variants.map((v, i) => (
              <div key={i} className="border rounded-md p-2.5">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-xs font-semibold">{v.label}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handlePick(v)}
                  >
                    <Check className="w-3 h-3 mr-1" /> {t("studio.hookOptimizer.use")}
                  </Button>
                </div>
                {v.title && <div className="text-sm font-medium">{v.title}</div>}
                {v.subtitle && <div className="text-xs text-muted-foreground">{v.subtitle}</div>}
                {v.text && <div className="text-xs mt-1">{v.text}</div>}
                <div className="text-[10px] text-muted-foreground mt-1.5 italic">{v.rationale}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-1">
            <Button size="sm" variant="outline" onClick={handleRun}>
              {t("studio.hookOptimizer.reAnalyse")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function sceneHasText(storyboard: unknown): boolean {
  if (!storyboard || typeof storyboard !== "object") return false;
  const scenes = (storyboard as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes) || scenes.length === 0) return false;
  return scenes.some((s) => {
    const text = (s as { text?: unknown })?.text;
    if (typeof text === "string") return text.trim().length > 0;
    if (Array.isArray(text)) return text.some((t) => typeof t === "string" && t.trim().length > 0);
    return false;
  });
}

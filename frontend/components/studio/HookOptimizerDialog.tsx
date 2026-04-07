"use client";

/**
 * HookOptimizerDialog — gap #143 frontend.
 *
 * Calls `POST /projects/:id/hook/optimize`, displays the diagnosis +
 * 3 variant hooks, and on accept patches scene 0 of the storyboard with
 * the chosen variant's title / text.
 */

import { useState } from "react";
import { Loader2, Zap, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

import { optimizeHook, type HookVariant, type HookOptimizerResult } from "@/lib/services/studio-features-service";

interface Props {
  projectId: string | null;
  storyboard: any;
  /** Patches scene 0 with the selected variant. */
  onApply: (sceneZeroPatch: { title?: string; subtitle?: string; text?: string }) => void;
}

export default function HookOptimizerDialog({ projectId, storyboard, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HookOptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    if (!projectId || !storyboard) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await optimizeHook({ projectId, storyboard });
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Hook optimizer failed");
    } finally {
      setLoading(false);
    }
  }

  function handlePick(v: HookVariant) {
    onApply({ title: v.title, subtitle: v.subtitle, text: v.text });
    setOpen(false);
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!projectId || !storyboard} title="AI hook optimizer">
          <Zap className="w-3.5 h-3.5 mr-1" /> Hook
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Hook Optimizer</DialogTitle>
          <DialogDescription>
            Analyses your first 3 seconds and suggests stronger alternatives. Uses retention data when available.
          </DialogDescription>
        </DialogHeader>

        {!result && !loading && (
          <div className="flex justify-center py-6">
            <Button onClick={handleRun}>
              <Zap className="w-4 h-4 mr-2" /> Analyse hook
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
                Diagnosis
              </div>
              <p className="text-xs">{result.diagnosis}</p>
              {result.retention.sampleSize > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Based on {result.retention.sampleSize} views · {result.retention.earlyDropPct}% drop in first 3 s
                  {result.retention.topDropOffSecond != null && ` · top drop @ ${result.retention.topDropOffSecond}s`}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {result.variants.map((v, i) => (
                <div key={i} className="border rounded-md p-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-xs font-semibold">{v.label}</div>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => handlePick(v)}>
                      <Check className="w-3 h-3 mr-1" /> Use
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
              <Button size="sm" variant="outline" onClick={handleRun}>Re-analyse</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

/**
 * HeadshotGenerator — the inner UI of the pro headshot generator,
 * extracted so it can be mounted directly inside a host shell (a
 * Dialog in v1 via HeadshotDialog, or a Sheet in v2's Actions panel)
 * without nesting modals.
 *
 * Two modes (#290):
 *   - "Keep my photo" (cutout) — in-browser segmentation + backdrop swap.
 *     Free, $0 infra.
 *   - "AI portrait" (portrait) — the selfie conditions a server img→img
 *     generation. Paid AI → Pro, gated in place via useProGate.
 *
 * Self-contained: holds its own state, picks the engine per mode,
 * revokes object URLs on unmount. Host shell supplies the title /
 * description chrome.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Sparkles, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useProGate } from "@/components/billing/useProGate";
import WebcamStillCapture from "./WebcamStillCapture";
import {
  BACKDROP_PRESETS,
  generateHeadshot,
  pickAvailableEngine,
  type HeadshotMode,
  type HeadshotResult,
} from "@/lib/services/headshot-engine";

const MODES: HeadshotMode[] = ["cutout", "portrait"];

export default function HeadshotGenerator() {
  const { t } = useTranslation();
  const { requirePro, gate } = useProGate();
  const [mode, setMode] = useState<HeadshotMode>("cutout");
  const [reference, setReference] = useState<Blob | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [backdropId, setBackdropId] = useState<string>(BACKDROP_PRESETS[0].id);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<HeadshotResult | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    pickAvailableEngine(mode)
      .then((engine) => { if (!cancelled) setEngineLabel(engine.label); })
      .catch(() => { if (!cancelled) setEngineLabel(t("studio.headshot.unavailable")); });
    return () => { cancelled = true; };
  }, [mode, t]);

  useEffect(() => () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
  }, [referencePreview]);
  useEffect(() => () => {
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
  }, [result]);

  const setReferenceFromBlob = (blob: Blob) => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReference(blob);
    setReferencePreview(URL.createObjectURL(blob));
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFromBlob(file);
  };

  const onGenerate = async () => {
    if (!reference || generating) return;
    if (mode === "portrait" && !requirePro(t("studio.headshot.portraitProReason"))) return;
    setGenerating(true);
    setProgress(0);
    setError(null);
    if (result) URL.revokeObjectURL(result.previewUrl);
    setResult(null);
    try {
      const res = await generateHeadshot({ reference, backdropId }, (p) => setProgress(p), mode);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("studio.headshot.failed"));
    } finally {
      setGenerating(false);
    }
  };

  const onDownload = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result.previewUrl;
    a.download = `headshot-${Date.now()}.png`;
    a.click();
  };

  const ready = useMemo(() => Boolean(reference) && !generating, [reference, generating]);
  const loadingCopy = mode === "cutout" && progress < 0.7
    ? t("studio.headshot.loadingModel")
    : t("studio.headshot.generatingPct", { pct: (progress * 100).toFixed(0) });

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {gate}
      <div className="space-y-3">
        <div role="radiogroup" aria-label={t("studio.headshot.modeLabel")} className="grid grid-cols-2 gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "min-h-11 rounded border-2 px-2 py-1.5 text-left text-xs transition-colors",
                mode === m ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40",
              )}
            >
              <span className="block font-medium">{t(`studio.headshot.mode.${m}`)}</span>
              <span className="block text-[10px] text-muted-foreground">{t(`studio.headshot.mode.${m}Hint`)}</span>
            </button>
          ))}
        </div>

        <div>
          <Label className="text-xs">{t("studio.headshot.reference")}</Label>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <WebcamStillCapture onCapture={setReferenceFromBlob} />
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-background px-3 py-3 text-xs text-muted-foreground hover:bg-accent">
              <Upload className="h-3.5 w-3.5" />
              {t("studio.headshot.upload")}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onUpload}
              />
            </label>
            {referencePreview && (
              <img
                src={referencePreview}
                alt={t("studio.headshot.referenceAlt")}
                className="aspect-square w-full rounded border object-cover"
              />
            )}
          </div>
        </div>

        <div>
          <Label className="text-xs">{t("studio.headshot.backdrop")}</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {BACKDROP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setBackdropId(preset.id)}
                className={cn(
                  "rounded border-2 p-2 text-[10px] transition-colors",
                  backdropId === preset.id
                    ? "border-primary"
                    : "border-transparent hover:border-muted-foreground/40",
                )}
              >
                <div
                  className="mb-1 h-12 w-full rounded"
                  style={{
                    background: `linear-gradient(135deg, ${preset.gradient.from}, ${preset.gradient.to})`,
                  }}
                  aria-hidden="true"
                />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={onGenerate} disabled={!ready} className="w-full">
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingCopy}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {t("studio.headshot.generate")}
            </>
          )}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs">{t("studio.headshot.result")}</Label>
          {engineLabel && (
            <Badge variant="outline" className="text-[10px]">{engineLabel}</Badge>
          )}
        </div>
        <div className="aspect-square overflow-hidden rounded border bg-muted/40">
          {result ? (
            <img src={result.previewUrl} alt={t("studio.headshot.resultAlt")} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {generating ? t("studio.headshot.working") : t("studio.headshot.placeholder")}
            </div>
          )}
        </div>
        {result && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onDownload}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t("studio.headshot.download")}
            </Button>
            <Badge variant="outline" className="text-[10px]">
              {t("studio.headshot.seconds", { s: (result.elapsedMs / 1000).toFixed(1) })}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

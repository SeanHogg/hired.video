/**
 * AI Headshot Generator page (`/studio/headshot`).
 *
 * Free WebGPU SDXL-Turbo path per `project_nle_decision.md`. The user
 * captures (or uploads) a reference photo, writes a prompt, and the
 * client-side engine returns a PNG. No server inference, no per-call
 * vendor cost, no BYOK.
 *
 * Self-hosted gating per the standing DRY rule:
 *   - Capability check (WebGPU? webcam?) happens INSIDE the engine
 *     facade and the WebcamStillCapture component. The page never
 *     re-implements those checks.
 *   - When WebGPU isn't available the engine facade picks the stub
 *     engine, which produces a clearly-labelled placeholder so the
 *     end-to-end flow is reviewable on any machine.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import WebcamStillCapture from "@/components/studio/WebcamStillCapture";
import { useSEO } from "@/lib/seo";
import {
  generateHeadshot,
  pickAvailableEngine,
  type HeadshotResult,
} from "@/lib/services/headshot-engine";

const PROMPT_PRESETS: { label: string; prompt: string }[] = [
  { label: "Corporate", prompt: "professional corporate headshot, navy blazer, neutral grey backdrop, soft studio lighting, sharp focus, 50mm portrait" },
  { label: "Tech / startup", prompt: "modern tech founder headshot, casual collared shirt, brick office wall background, daylight, slight smile, depth of field" },
  { label: "Creative", prompt: "creative director portrait, art-directed lighting, expressive pose, colourful gradient backdrop, magazine-style retouch" },
  { label: "Speaker", prompt: "conference speaker headshot, dark backdrop with subtle bokeh, confident eye contact, professional retouch" },
];

const DEFAULT_NEGATIVE = "blurry, low quality, deformed face, extra fingers, watermark, signature";

export default function HeadshotGenerator() {
  useSEO("/studio/headshot");

  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0].prompt);
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEGATIVE);
  const [steps, setSteps] = useState(2);
  const [reference, setReference] = useState<Blob | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<HeadshotResult | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>("");

  // Resolve which engine is going to run so the UI can warn the user
  // when they're about to hit the placeholder. Done once on mount —
  // single source of truth via pickAvailableEngine().
  useEffect(() => {
    let cancelled = false;
    pickAvailableEngine()
      .then((engine) => { if (!cancelled) setEngineLabel(engine.label); })
      .catch(() => { if (!cancelled) setEngineLabel("Unavailable"); });
    return () => { cancelled = true; };
  }, []);

  // Revoke object URLs on unmount so the browser can free the memory.
  useEffect(() => () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
  }, [referencePreview, result]);

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
    if (generating) return;
    setGenerating(true);
    setProgress(0);
    if (result) URL.revokeObjectURL(result.previewUrl);
    setResult(null);
    try {
      const res = await generateHeadshot(
        {
          prompt,
          negativePrompt,
          reference,
          steps,
          width: 1024,
          height: 1024,
        },
        (p) => setProgress(p),
      );
      setResult(res);
      toast.success("Headshot generated", {
        description: `${(res.elapsedMs / 1000).toFixed(1)}s · ${res.engine}`,
      });
    } catch (err) {
      toast.error("Headshot failed", {
        description: err instanceof Error ? err.message : String(err),
      });
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

  const isStub = engineLabel.startsWith("Placeholder");
  const stepsLabel = useMemo(() => `${steps} step${steps === 1 ? "" : "s"}`, [steps]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Headshot Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a portrait directly in your browser. Your reference photo never leaves your device.
          </p>
        </div>
        <Badge variant={isStub ? "destructive" : "secondary"} className="text-[10px]">
          Engine: {engineLabel || "…"}
        </Badge>
      </div>

      {isStub && (
        <div className="mb-4 rounded border border-yellow-500/40 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-300">
          WebGPU isn't available in this browser, so the page will produce a placeholder image instead of a real headshot. Use a recent Chrome or Edge to enable real generation.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* ── Left column: inputs ───────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Reference photo (optional)</Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <WebcamStillCapture onCapture={setReferenceFromBlob} />
              <div className="space-y-2">
                <Label className="text-[11px] text-muted-foreground">…or upload</Label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-background px-3 py-6 text-xs text-muted-foreground hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" />
                  Drop or click to choose
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
                    alt="Reference"
                    className="aspect-square w-full rounded border object-cover"
                  />
                )}
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs">Style preset</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROMPT_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => setPrompt(preset.prompt)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="prompt" className="text-xs">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="neg" className="text-xs">Negative prompt</Label>
            <Input
              id="neg"
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Inference steps</Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{stepsLabel}</span>
            </div>
            <Slider
              value={[steps]}
              min={1}
              max={4}
              step={1}
              onValueChange={(v) => setSteps(v[0] ?? 2)}
              className="mt-2"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              SDXL-Turbo runs in 1–4 steps. More steps = slightly cleaner result.
            </p>
          </div>

          <Button onClick={onGenerate} disabled={generating || !prompt.trim()} className="w-full">
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {progress < 0.6 ? "Loading model…" : `Generating ${(progress * 100).toFixed(0)}%`}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate headshot
              </>
            )}
          </Button>
        </div>

        {/* ── Right column: result ──────────────────────────────────── */}
        <div className="space-y-3">
          <Label className="text-xs">Result</Label>
          <div className="aspect-square overflow-hidden rounded border bg-muted/40">
            {result ? (
              <img src={result.previewUrl} alt="Generated headshot" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                {generating ? "Working…" : "Your headshot will appear here"}
              </div>
            )}
          </div>
          {result && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onDownload}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download PNG
              </Button>
              <Badge variant="outline" className="text-[10px]">
                {result.engine}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {(result.elapsedMs / 1000).toFixed(1)}s
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

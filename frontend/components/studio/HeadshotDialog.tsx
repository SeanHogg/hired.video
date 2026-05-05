"use client";

/**
 * HeadshotDialog — pro headshot generator mounted inside the studio
 * Actions tab. Opens a modal with webcam capture + upload, backdrop
 * preset picker, and a Generate button. The actual model dispatch
 * goes through the shared `generateHeadshot()` facade so this
 * component never picks the engine — single source of truth lives in
 * `lib/services/headshot-engine.ts`.
 *
 * Per the standing DRY rule the trigger button + dialog are one
 * component; consumers (Actions tab today, sidebar tools tomorrow)
 * just mount `<HeadshotDialog />` without any per-site state.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import WebcamStillCapture from "./WebcamStillCapture";
import {
  BACKDROP_PRESETS,
  generateHeadshot,
  pickAvailableEngine,
  type HeadshotResult,
} from "@/lib/services/headshot-engine";

export default function HeadshotDialog() {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState<Blob | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [backdropId, setBackdropId] = useState<string>(BACKDROP_PRESETS[0].id);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<HeadshotResult | null>(null);
  const [engineLabel, setEngineLabel] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    pickAvailableEngine()
      .then((engine) => { if (!cancelled) setEngineLabel(engine.label); })
      .catch(() => { if (!cancelled) setEngineLabel("Unavailable"); });
    return () => { cancelled = true; };
  }, [open]);

  // Revoke object URLs when they're replaced or the dialog closes.
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
    setGenerating(true);
    setProgress(0);
    if (result) URL.revokeObjectURL(result.previewUrl);
    setResult(null);
    try {
      const res = await generateHeadshot(
        { reference, backdropId },
        (p) => setProgress(p),
      );
      setResult(res);
    } catch (err) {
      // Surface in the badge area; the dialog stays open so the user
      // can retry with a different photo.
      setEngineLabel(err instanceof Error ? `Error: ${err.message}` : "Error");
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs">
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          AI Headshot
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pro headshot generator</DialogTitle>
          <DialogDescription>
            Webcam or upload → background removed → composited on a
            studio backdrop. Runs entirely in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reference photo</Label>
              <div className="mt-2 grid grid-cols-1 gap-2">
                <WebcamStillCapture onCapture={setReferenceFromBlob} />
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed bg-background px-3 py-3 text-xs text-muted-foreground hover:bg-accent">
                  <Upload className="h-3.5 w-3.5" />
                  Or upload a photo
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

            <div>
              <Label className="text-xs">Backdrop</Label>
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
                  {progress < 0.7 ? "Loading model…" : `Generating ${(progress * 100).toFixed(0)}%`}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate headshot
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Result</Label>
              {engineLabel && (
                <Badge variant="outline" className="text-[10px]">{engineLabel}</Badge>
              )}
            </div>
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
                  {(result.elapsedMs / 1000).toFixed(1)}s
                </Badge>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

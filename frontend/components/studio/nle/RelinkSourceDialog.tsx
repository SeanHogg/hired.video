/**
 * RelinkSourceDialog — point an offline source at a fresh upload.
 * Closes #346.
 *
 * Pro NLEs handle "media offline" by surfacing a relink action: the
 * project keeps every clip's reference to the source row, but the row's
 * `url` is rewritten to a new R2 object. Every clip in the timeline
 * picks up the new URL on next preload — no clip-level rewrite needed,
 * because clips reference sources by id.
 *
 * Two relink paths:
 *   1. Re-upload the file → backend dedupes by content hash and
 *      returns the new url; we then patch the offline row to point at it.
 *   2. Manual URL entry — for power users who already moved the file
 *      to a known location.
 *
 * The status probe (HEAD on the existing url) is best-effort. Some R2
 * + CDN setups return 200 on bare HEAD because of caching; we still
 * surface the dialog when the user invokes it manually.
 */

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, Link } from "lucide-react";
import { nleApi, type NleMediaSourceWithBin } from "@/lib/timeline/api";
import { probeSource } from "@/lib/timeline/source-probe";

interface Props {
  source: NleMediaSourceWithBin;
  onClose: () => void;
  /** Called with the freshly-patched row so the parent's bin updates. */
  onRelinked: (next: NleMediaSourceWithBin) => void;
}

type ProbeState = "idle" | "checking" | "online" | "offline";

export default function RelinkSourceDialog({ source, onClose, onRelinked }: Props) {
  const [probeState, setProbeState] = useState<ProbeState>("idle");
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [manualUrl, setManualUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe whether the existing URL still serves bytes. Single source of
  // truth for "is this offline" — components that need the same answer
  // call probe via the same fetch.
  useEffect(() => {
    let cancelled = false;
    setProbeState("checking");
    fetch(source.url, { method: "HEAD" })
      .then((res) => {
        if (cancelled) return;
        setProbeState(res.ok ? "online" : "offline");
      })
      .catch(() => {
        if (cancelled) return;
        setProbeState("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [source.url]);

  const handleUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      // Probe so the upload carries the correct durationFrames / fps.
      const probed = await probeSource(file);
      const upload = await nleApi.uploadSource(file, {
        kind: probed.kind,
        durationFrames: probed.durationFrames,
        fps: probed.fps,
        width: probed.width ?? null,
        height: probed.height ?? null,
      });
      // Rewrite the offline row to point at the new url. Filename
      // also rolls so the bin reflects whatever the user just picked.
      const patched = await nleApi.patchSource(source.id, {
        url: upload.source.url,
        filename: upload.source.filename,
      });
      onRelinked(patched.source);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleManualUrl = async () => {
    if (!manualUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const patched = await nleApi.patchSource(source.id, { url: manualUrl.trim() });
      onRelinked(patched.source);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Patch failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-background/80 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-card border rounded-lg p-4 w-96 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold">Relink offline source</h3>
        <div className="text-[11px] text-muted-foreground truncate">{source.filename}</div>
        <div className="text-[11px]">
          Status:{" "}
          {probeState === "checking" && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> probing…
            </span>
          )}
          {probeState === "online" && <span className="text-emerald-600">online (relink anyway?)</span>}
          {probeState === "offline" && <span className="text-destructive">offline — original URL didn't respond</span>}
          {probeState === "idle" && <span className="text-muted-foreground">unknown</span>}
        </div>

        <div className="flex items-center gap-1 text-[11px]">
          <Button
            size="sm"
            variant={mode === "upload" ? "default" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setMode("upload")}
          >
            <Upload className="h-3 w-3 mr-1" /> Upload replacement
          </Button>
          <Button
            size="sm"
            variant={mode === "url" ? "default" : "ghost"}
            className="h-7 px-2 text-[11px]"
            onClick={() => setMode("url")}
          >
            <Link className="h-3 w-3 mr-1" /> Paste URL
          </Button>
        </div>

        {mode === "upload" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium">Pick the replacement file</label>
            <Input
              type="file"
              accept="video/*,audio/*,image/*"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
              }}
              className="h-7 text-[11px]"
            />
            <p className="text-[10px] text-muted-foreground">
              We'll re-probe duration and fps from the file; clips referencing this source
              will pick up the new URL on next preload.
            </p>
          </div>
        )}

        {mode === "url" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium">Replacement URL</label>
            <Input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://…"
              className="h-7 text-[11px]"
              disabled={busy}
            />
          </div>
        )}

        {error && <div className="text-[11px] text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {mode === "url" && (
            <Button size="sm" onClick={handleManualUrl} disabled={busy || !manualUrl.trim()}>
              {busy ? "Saving…" : "Relink"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

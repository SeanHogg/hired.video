/**
 * PageEmbedDialog (#1860) — the "Embed" affordance a SuperAdmin clicks
 * after reviewing a generated Studio video.
 *
 * Offers BOTH delivery models (the operator chose "both"):
 *   1. Publish to a hired.video page — writes the page→video mapping so
 *      the shared <MarketingPageVideo> renders it automatically (no .tsx
 *      edits). Works even before render (the SPA player lazy-renders).
 *   2. Embed anywhere — a copy-paste keyless iframe snippet for external
 *      sites. Requires a rendered video (an external iframe can't run the
 *      live canvas renderer).
 *
 * SuperAdmin-only: the parent only mounts/triggers this for SuperAdmins,
 * and every backend route it calls re-checks `isSuperAdmin`.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Globe, Code2, Clapperboard, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { studioService } from "@/lib/services/studio-service";
import { buildVideoEmbedSnippet } from "@shared/embed";
import { cn } from "@/lib/utils";

interface PageEmbedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Studio project id of the video to embed. */
  projectId: string;
  /** Whether the project has a baked/rendered video — gates the external
   *  iframe snippet (the managed page placement works regardless). */
  rendered: boolean;
  /** Pre-fill for the page route (e.g. the page the video was built from). */
  defaultPathname?: string;
  /** Render + upload the project, returning true once it has a baked
   *  video. Supplied by the editor (its `ensureRendered()`); lets the
   *  dialog auto-render on publish so the external snippet works
   *  immediately (#1865). When omitted, the snippet stays gated on
   *  `rendered`. */
  onEnsureRendered?: () => Promise<boolean>;
}

export function PageEmbedDialog({
  open,
  onOpenChange,
  projectId,
  rendered,
  defaultPathname,
  onEnsureRendered,
}: PageEmbedDialogProps): JSX.Element {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pathname, setPathname] = useState(defaultPathname ?? "");
  const [placement, setPlacement] = useState<"hero" | "inline">("hero");
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  // Tracks render state locally so an in-dialog render (auto on publish, or
  // the explicit "Render now" button) immediately enables the snippet
  // without closing + reopening.
  const [localRendered, setLocalRendered] = useState(rendered);
  const [rendering, setRendering] = useState(false);

  const snippet = buildVideoEmbedSnippet({
    origin: typeof window !== "undefined" ? window.location.origin : "",
    videoId: projectId,
  });

  /** Best-effort render+upload. Returns true when the project ends up with
   *  a baked video. No-op (false) when the editor didn't supply a hook. */
  async function ensureRendered(): Promise<boolean> {
    if (localRendered) return true;
    if (!onEnsureRendered) return false;
    setRendering(true);
    try {
      const ok = await onEnsureRendered();
      setLocalRendered(ok);
      return ok;
    } catch (err) {
      toast({
        title: t("studio.pageEmbed.renderFailed"),
        description: err instanceof Error ? err.message : t("studio.pageEmbed.unknownError"),
        variant: "destructive",
      });
      return false;
    } finally {
      setRendering(false);
    }
  }

  async function handlePublish() {
    const path = pathname.trim();
    if (!path) {
      toast({
        title: t("studio.pageEmbed.pathRequired"),
        description: t("studio.pageEmbed.pathExample"),
        variant: "destructive",
      });
      return;
    }
    setPublishing(true);
    try {
      // Auto-render on publish (#1865) so the SAME video also works as an
      // external snippet, not just the SPA lazy-render placement. Best
      // effort — if it fails or no hook is wired, the managed placement
      // still lazy-renders, so we proceed with the publish regardless.
      await ensureRendered();
      const { data } = await studioService.setPageEmbed({ pathname: path, projectId, placement });
      await queryClient.invalidateQueries({ queryKey: ["page-embed", data.pathname] });
      await queryClient.invalidateQueries({ queryKey: ["page-embed-paths"] });
      toast({
        title: t("studio.pageEmbed.published"),
        description: t("studio.pageEmbed.publishedDesc", { path: data.pathname }),
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t("studio.pageEmbed.publishFailed"),
        description: err instanceof Error ? err.message : t("studio.pageEmbed.unknownError"),
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: t("studio.pageEmbed.copyFailed"),
        description: t("studio.pageEmbed.copyFailedDesc"),
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("studio.pageEmbed.title")}</DialogTitle>
          <DialogDescription>
            {t("studio.pageEmbed.description")}
          </DialogDescription>
        </DialogHeader>

        {/* 1 — Managed page placement */}
        <section className="min-w-0 space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4 shrink-0 text-brand-primary" />
            {t("studio.pageEmbed.publishHeading")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-embed-path" className="text-xs text-muted-foreground">
              {t("studio.pageEmbed.pagePath")}
            </Label>
            <Input
              id="page-embed-path"
              value={pathname}
              onChange={(e) => setPathname(e.target.value)}
              placeholder="/pricing"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("studio.pageEmbed.placement")}</span>
            {(["hero", "inline"] as const).map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={placement === p ? "default" : "outline"}
                className="h-7"
                onClick={() => setPlacement(p)}
              >
                {t(p === "hero" ? "studio.pageEmbed.placementHero" : "studio.pageEmbed.placementInline")}
              </Button>
            ))}
          </div>
          <Button onClick={handlePublish} disabled={publishing || rendering} className="w-full">
            {publishing
              ? t(rendering ? "studio.pageEmbed.rendering" : "studio.pageEmbed.publishing")
              : t("studio.pageEmbed.publish")}
          </Button>
        </section>

        {/* 2 — External snippet */}
        <section className="min-w-0 space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code2 className="h-4 w-4 shrink-0 text-brand-blue" />
            {t("studio.pageEmbed.embedHeading")}
          </div>
          {!localRendered && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("studio.pageEmbed.needsRender")}{" "}
              {t(onEnsureRendered ? "studio.pageEmbed.needsRenderAuto" : "studio.pageEmbed.needsRenderExport")}
            </p>
          )}
          <pre
            className={cn(
              "max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs text-foreground",
              !localRendered && "opacity-50",
            )}
          >
            <code>{snippet}</code>
          </pre>
          {localRendered ? (
            <Button variant="outline" onClick={handleCopy} className="w-full gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {t(copied ? "studio.pageEmbed.copied" : "studio.pageEmbed.copySnippet")}
            </Button>
          ) : onEnsureRendered ? (
            <Button variant="outline" onClick={ensureRendered} disabled={rendering} className="w-full gap-2">
              {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {t(rendering ? "studio.pageEmbed.rendering" : "studio.pageEmbed.renderNow")}
            </Button>
          ) : (
            <Button variant="outline" disabled className="w-full gap-2">
              <Copy className="h-4 w-4" />
              {t("studio.pageEmbed.copySnippet")}
            </Button>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

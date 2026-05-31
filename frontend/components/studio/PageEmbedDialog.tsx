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
import { Check, Copy, Globe, Code2 } from "lucide-react";
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
}

export function PageEmbedDialog({
  open,
  onOpenChange,
  projectId,
  rendered,
  defaultPathname,
}: PageEmbedDialogProps): JSX.Element {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pathname, setPathname] = useState(defaultPathname ?? "");
  const [placement, setPlacement] = useState<"hero" | "inline">("hero");
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const snippet = buildVideoEmbedSnippet({
    origin: typeof window !== "undefined" ? window.location.origin : "",
    videoId: projectId,
  });

  async function handlePublish() {
    const path = pathname.trim();
    if (!path) {
      toast({ title: "Enter a page path", description: "e.g. /pricing", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const { data } = await studioService.setPageEmbed({ pathname: path, projectId, placement });
      await queryClient.invalidateQueries({ queryKey: ["page-embed", data.pathname] });
      await queryClient.invalidateQueries({ queryKey: ["page-embed-paths"] });
      toast({
        title: "Published to page",
        description: `This video now renders on ${data.pathname}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't publish",
        description: err instanceof Error ? err.message : "Unknown error",
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
      toast({ title: "Copy failed", description: "Select and copy manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Embed this video</DialogTitle>
          <DialogDescription>
            Place it on a hired.video page, or copy a snippet for any site.
          </DialogDescription>
        </DialogHeader>

        {/* 1 — Managed page placement */}
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Globe className="h-4 w-4 text-brand-purple" />
            Publish to a hired.video page
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="page-embed-path" className="text-xs text-muted-foreground">
              Page path
            </Label>
            <Input
              id="page-embed-path"
              value={pathname}
              onChange={(e) => setPathname(e.target.value)}
              placeholder="/pricing"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Placement:</span>
            {(["hero", "inline"] as const).map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={placement === p ? "default" : "outline"}
                className="h-7 capitalize"
                onClick={() => setPlacement(p)}
              >
                {p}
              </Button>
            ))}
          </div>
          <Button onClick={handlePublish} disabled={publishing} className="w-full">
            {publishing ? "Publishing…" : "Publish to page"}
          </Button>
        </section>

        {/* 2 — External snippet */}
        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Code2 className="h-4 w-4 text-brand-blue" />
            Embed anywhere
          </div>
          {!rendered && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Export &amp; publish the video first — the external snippet needs a rendered file.
            </p>
          )}
          <pre
            className={cn(
              "overflow-x-auto rounded-md bg-muted p-3 text-xs",
              !rendered && "opacity-50",
            )}
          >
            <code>{snippet}</code>
          </pre>
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={!rendered}
            className="w-full gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}

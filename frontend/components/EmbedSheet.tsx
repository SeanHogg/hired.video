// Generic embed-snippet slide-out — shared between Resume "Embed" and Studio
// Video "Embed code" surfaces. Pure presentational shell: callers compute the
// snippet + preview URL themselves (resumes do it synchronously, the studio
// fetches via the embed endpoint) and pass them in.

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The iframe HTML the user pastes into their site. */
  snippet: string | null;
  /** URL the "Open preview" button navigates to. */
  previewUrl: string | null;
  /** Heading + description override. Defaults to "Embed this content". */
  heading?: string;
  description?: string;
  /** True while the snippet is being fetched async (studio video case). */
  loading?: boolean;
  /** Error to surface in the panel — overrides snippet/preview when set. */
  error?: string | null;
}

export function EmbedSheet({
  open,
  onOpenChange,
  snippet,
  previewUrl,
  heading = "Embed this content",
  description = "Drop this snippet into any website, blog post, or portfolio to show this content inline.",
  loading,
  error,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail in insecure contexts — quietly ignore
    }
  };

  const handlePreview = () => {
    if (!previewUrl) return;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle>{heading}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
        </div>
        <div className="p-6 pt-4 space-y-6">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : loading || !snippet ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin" />
              Preparing embed snippet…
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">1. Copy the embed snippet</h3>
                  <Button size="sm" variant="outline" onClick={handleCopy}>
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded p-3 overflow-auto whitespace-pre-wrap break-all select-all">
{snippet}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Adjust <code>width</code> and <code>height</code> to match your layout.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">2. Preview the embedded view</h3>
                <p className="text-xs text-muted-foreground">
                  See exactly how it will render inside the iframe — no platform
                  chrome, no navigation.
                </p>
                <Button variant="outline" onClick={handlePreview} disabled={!previewUrl}>
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Open preview in new tab
                </Button>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">3. Paste into your site</h3>
                <p className="text-xs text-muted-foreground">
                  Most CMSes (WordPress, Ghost, Webflow, Squarespace) accept raw HTML
                  blocks. Paste the snippet there and publish.
                </p>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

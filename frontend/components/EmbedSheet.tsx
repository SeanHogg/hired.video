// Slide-out panel shown when the user picks "Embed" from a resume's "..." menu.
// Gives them a ready-to-paste <iframe> snippet, a copy button, and a link that
// previews the embedded view in a new window.

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
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
  resumeId: string;
  resumeName?: string;
}

export function EmbedSheet({ open, onOpenChange, resumeId, resumeName }: Props) {
  const [copied, setCopied] = useState(false);

  const embedUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/embedded/resumes/${resumeId}`;
  }, [resumeId]);

  const snippet = useMemo(() => {
    const title = resumeName ? ` title="${resumeName.replace(/"/g, "&quot;")}"` : "";
    return `<iframe src="${embedUrl}" width="100%" height="900" frameborder="0" loading="lazy"${title}></iframe>`;
  }, [embedUrl, resumeName]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API can fail in insecure contexts — quietly ignore
    }
  };

  const handlePreview = () => {
    window.open(embedUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        <div className="p-6 pb-4 border-b">
          <SheetHeader>
            <SheetTitle>Embed this resume</SheetTitle>
            <SheetDescription>
              Drop this snippet into any website, blog post, or portfolio to show
              the resume inline. The embed stays in sync with edits you make here.
            </SheetDescription>
          </SheetHeader>
        </div>
        <div className="p-6 pt-4 space-y-6">
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
              Most sites look best with a fixed height between 800 and 1200 pixels.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">2. Preview the embedded view</h3>
            <p className="text-xs text-muted-foreground">
              See exactly how the resume will render inside the iframe — no platform
              chrome, no navigation.
            </p>
            <Button variant="outline" onClick={handlePreview}>
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
        </div>
      </SheetContent>
    </Sheet>
  );
}

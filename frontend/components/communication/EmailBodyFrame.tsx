// Sandboxed iframe renderer for one email body. The iframe carries
// `sandbox="allow-popups allow-popups-to-escape-sandbox"` — no JS,
// no top-level nav of the iframe itself, no form submit, no
// same-origin access; the only thing allowed is opening links in a
// new top-level tab (escaping the sandbox so the new tab is a
// regular browsing context, not an inherited sandbox). Combined with
// the sanitiser's `<base target="_blank">` + per-link target rewrite,
// every `<a href>` in the body opens in a fresh tab.
//
// Remote images are stripped by default to defeat tracking pixels —
// the per-message "Display images" toggle restores them.
//
// The iframe stretches to fill its container — the inbox detail
// sheet places this in a `flex-1 min-h-0 flex flex-col` slot, so the
// iframe (also `flex-1`) consumes every available pixel down to the
// panel edge. Overflow is handled by the iframe's own internal
// scrollbar.
//
// Self-gates on `bodyHtml ?? bodyText`: a row with neither falls
// through to the snippet (or "(no body)") provided by the parent.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageOff, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  plainTextToIframeHtml,
  sanitizeEmailHtml,
} from "@/lib/email-rendering/sanitize";

export interface EmailBodyFrameProps {
  bodyHtml: string | null;
  bodyText: string | null;
  /** Optional fallback when both bodyHtml and bodyText are empty. */
  fallback?: string;
  className?: string;
}

export function EmailBodyFrame({
  bodyHtml,
  bodyText,
  fallback = "(no body)",
  className,
}: EmailBodyFrameProps) {
  const [loadImages, setLoadImages] = useState(false);

  const { html, hadImages, isHtml } = useMemo(() => {
    if (bodyHtml && bodyHtml.trim().length > 0) {
      const out = sanitizeEmailHtml(bodyHtml, { loadImages });
      return { html: out.html, hadImages: out.hadImages, isHtml: true };
    }
    const text = bodyText?.trim() || fallback;
    const out = plainTextToIframeHtml(text);
    return { html: out.html, hadImages: out.hadImages, isHtml: false };
  }, [bodyHtml, bodyText, fallback, loadImages]);

  return (
    <div className={cn("flex flex-col", className)}>
      {isHtml && hadImages && (
        <div className="flex items-center justify-end mb-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px]"
            onClick={() => setLoadImages((v) => !v)}
            title={
              loadImages
                ? "Hide remote images to block tracking pixels"
                : "Load remote images — may notify the sender that you opened the message"
            }
          >
            {loadImages ? (
              <>
                <ImageOff className="h-3 w-3 mr-1" />
                Hide images
              </>
            ) : (
              <>
                <ImageIcon className="h-3 w-3 mr-1" />
                Display images
              </>
            )}
          </Button>
        </div>
      )}
      <iframe
        title="Email body"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html}
        referrerPolicy="no-referrer"
        className="w-full flex-1 min-h-0 border rounded bg-background"
      />
    </div>
  );
}

export default EmailBodyFrame;

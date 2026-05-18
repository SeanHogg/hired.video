// Sandboxed iframe renderer for one email body. The iframe carries
// `sandbox=""` (no JS, no top-level nav, no form submit, no popups),
// so even malicious HTML can't escape into the host app. Remote
// images are stripped by default to defeat tracking pixels — the
// per-message "Display images" toggle restores them.
//
// Self-gates on `bodyHtml ?? bodyText`: a row with neither falls
// through to the snippet (or "(no body)") provided by the parent.

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageOff, ImageIcon } from "lucide-react";
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(280);

  const { html, hadImages, isHtml } = useMemo(() => {
    if (bodyHtml && bodyHtml.trim().length > 0) {
      const out = sanitizeEmailHtml(bodyHtml, { loadImages });
      return { html: out.html, hadImages: out.hadImages, isHtml: true };
    }
    const text = bodyText?.trim() || fallback;
    const out = plainTextToIframeHtml(text);
    return { html: out.html, hadImages: out.hadImages, isHtml: false };
  }, [bodyHtml, bodyText, fallback, loadImages]);

  // Resize the iframe to fit content. ResizeObserver inside the
  // sandbox can't reach the parent, so we measure scrollHeight on the
  // document instead. Re-runs whenever `html` changes (toggle / new
  // message).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc) return;
        const h = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
        );
        setHeight(Math.min(Math.max(120, h), 700));
      } catch {
        // Cross-origin or other access error — leave default height.
      }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  return (
    <div className={className}>
      {isHtml && hadImages && (
        <div className="flex items-center justify-end mb-1">
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
        ref={iframeRef}
        title="Email body"
        sandbox=""
        srcDoc={html}
        // Block scripts at the iframe-attribute level too; some
        // older browsers respect `csp` here, modern ones use the
        // sandbox attribute. Defence-in-depth.
        referrerPolicy="no-referrer"
        className="w-full border rounded bg-background"
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

export default EmailBodyFrame;

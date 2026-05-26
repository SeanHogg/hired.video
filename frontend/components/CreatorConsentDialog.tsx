"use client";

/**
 * CreatorConsentDialog — shared consent + visibility-flip dialog used by
 * three flows (DRY rule):
 *
 *   - Resume Template marketplace (#158)
 *   - Voice Clone marketplace      (already shipped, see VoiceCloneManager)
 *   - Writer Partner Program       (#173)
 *
 * Each call site supplies its own copy ("title", "checkbox label",
 * "terms doc kind") and submit handler. The dialog snapshots
 * `consentAgreedAt` / IP / UA via the parent's submit handler (the
 * server-side route is the source of truth — this is just the UX seam).
 *
 * Why shared instead of three separate dialogs: the legal-document
 * `kind` axis is the only thing that varies. Hard-coding three near-
 * identical components would mean every copy tweak lands in three
 * places.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, FileText } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface LegalDoc {
  id: string;
  kind: string;
  version: string;
  title: string;
  body: string;
  publishedAt: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** "By publishing this template, I confirm that …" */
  consentLabel: string;
  /** The legal doc kind to fetch + require acceptance of. */
  termsKind: string;
  /** When the user has already opted in, the parent should pass the
   *  current platform fee bps + price so the dialog can surface them.
   *  When set, the action becomes "Confirm" — re-applying the same
   *  consent (e.g. after a legal-doc update). */
  initialPlatformFeeBps?: number;
  initialPriceCents?: number;
  /** Whether the price field is shown + editable. Voice clones + resume
   *  templates yes; writer opt-in no (writers don't price articles). */
  withPricing?: boolean;
  /** Called when the user clicks Confirm. Server-side acceptance write
   *  + visibility flip lives in the parent's handler. */
  onConfirm: (args: { priceCents: number; acceptedDocId: string | null }) => Promise<void>;
  /** Cancel label override — e.g. "Keep private" for the template flow. */
  cancelLabel?: string;
}

export default function CreatorConsentDialog({
  open,
  onOpenChange,
  title,
  consentLabel,
  termsKind,
  initialPlatformFeeBps = 500,
  initialPriceCents = 0,
  withPricing = false,
  onConfirm,
  cancelLabel = "Cancel",
}: Props) {
  const [agreed, setAgreed] = useState(false);
  const [priceCents, setPriceCents] = useState(initialPriceCents);
  const [doc, setDoc] = useState<LegalDoc | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAgreed(false);
    setError(null);
    setDocLoading(true);
    apiClient
      .get<{ data: LegalDoc | null }>(`/api/legal/current/${termsKind}`)
      .then((res) => setDoc((res.data as any) ?? null))
      .catch(() => setDoc(null))
      .finally(() => setDocLoading(false));
  }, [open, termsKind]);

  async function handleConfirm() {
    if (!agreed) {
      setError("You must agree to the terms to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ priceCents, acceptedDocId: doc?.id ?? null });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            We snapshot your IP + user agent + the version of these terms so this
            consent is auditable later. Platform fee on sales is{" "}
            {initialPlatformFeeBps / 100}%.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[40vh] overflow-y-auto rounded border p-3 bg-muted/30 text-sm">
          {docLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the latest terms…
            </div>
          ) : doc ? (
            <>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                {doc.title} · v{doc.version}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{doc.body}</pre>
            </>
          ) : (
            <div className="flex items-start gap-2 text-amber-700 text-xs">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>
                No current terms document for <code className="bg-amber-100 px-1 rounded">{termsKind}</code>{" "}
                yet. Ask a SuperAdmin to publish it before consent can be recorded.
              </span>
            </div>
          )}
        </div>

        {withPricing && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="creator-consent-price">
              Price (USD)
            </label>
            <input
              id="creator-consent-price"
              type="number"
              min={0}
              step={1}
              className="w-full rounded border px-3 py-2 text-sm"
              value={priceCents / 100}
              onChange={(e) => setPriceCents(Math.max(0, Math.round(Number(e.target.value) * 100)))}
            />
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
          <span>{consentLabel}</span>
        </label>

        {error && (
          <div className="text-sm text-red-600 flex items-start gap-1">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button onClick={handleConfirm} disabled={!agreed || !doc || submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

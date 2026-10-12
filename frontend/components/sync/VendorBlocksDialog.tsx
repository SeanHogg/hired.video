/**
 * VendorBlocksDialog — render the user's resume into vendor-shaped paste
 * blocks (LinkedIn About, Indeed Summary, GitHub README, ...). One card
 * per block with a Copy button and a charLimit indicator.
 *
 * Stateless beyond its own loading/error state — fetches blocks on open
 * and discards them on close.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Check, Copy, Loader2, ExternalLink, RotateCcw, Wand2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useExtensionBridge } from "@/hooks/use-extension-bridge";
import {
  vendorSyncService,
  type ExportBlock,
  type VendorConnectorListItem,
} from "@/lib/services/vendor-sync-service";

interface VendorBlocksDialogProps {
  open: boolean;
  onClose: () => void;
  connector: VendorConnectorListItem;
  resumeId: string;
  resumeTitle: string;
}

export default function VendorBlocksDialog({
  open, onClose, connector, resumeId, resumeTitle,
}: VendorBlocksDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ExportBlock[]>([]);
  const [autofillingSection, setAutofillingSection] = useState<string | null>(null);
  // Multi-step autofill (#2138): how many steps of each block are filled,
  // and which block's step is in flight — advanced only on a confirmed fill.
  const [stepsFilled, setStepsFilled] = useState<Record<string, number>>({});
  const stepInFlight = useRef<string | null>(null);

  // Listen for autofill results broadcast by the service worker so we
  // can toast success/failure for the user. The send side is colocated
  // in handleAutofill below.
  const { send } = useExtensionBridge<{
    status: "filled" | "skipped" | "error";
    error?: string;
    vendorId?: string;
    blockSection?: string;
  }>({
    listenFor: "vendor-sync:autofill-result",
    onEvent: (payload) => {
      if (!payload) return;
      setAutofillingSection(null);
      const steppedKey = stepInFlight.current;
      stepInFlight.current = null;
      if (payload.status === "filled" && steppedKey) {
        setStepsFilled((prev) => ({ ...prev, [steppedKey]: (prev[steppedKey] ?? 0) + 1 }));
      }
      if (payload.status === "filled") {
        toast({
          title: t("tools.vendorSync.autofillSuccess.title", {
            section: payload.blockSection ?? "field",
            vendor: connector.label,
          }),
          description: t("tools.vendorSync.autofillSuccess.description"),
        });
      } else {
        const reason = payload.error === "NO_VENDOR_TAB"
          ? t("tools.vendorSync.autofillError.noTab", { vendor: connector.label })
          : payload.error === "FIELD_NOT_FOUND"
          ? t("tools.vendorSync.autofillError.fieldNotFound", {
              section: payload.blockSection ?? "section",
              vendor: connector.label,
            })
          : payload.error === "INJECTION_FAILED"
          ? t("tools.vendorSync.autofillError.injection")
          : t("tools.vendorSync.autofillError.unknown");
        toast({
          title: t("tools.vendorSync.autofillSkipped"),
          description: reason,
          variant: "destructive",
        });
      }
    },
  });

  const handleAutofill = useCallback((block: ExportBlock) => {
    if (!block.autofillSelector) return;
    setAutofillingSection(block.section + (block.subSection ?? ""));
    send("vendor-sync:autofill-field", {
      vendorId: connector.id,
      selector: block.autofillSelector,
      value: block.text,
      blockSection: block.section,
    });
    // Defensive: clear the spinner if the extension never responds.
    setTimeout(() => setAutofillingSection(null), 8_000);
  }, [connector.id, send]);

  /** Fill the next field of a multi-step block — one field per click, so
   *  the user checks each (and picks typeahead matches) before the next. */
  const handleAutofillStep = useCallback((block: ExportBlock) => {
    const steps = block.autofillSteps ?? [];
    const key = block.section + (block.subSection ?? "");
    const step = steps[stepsFilled[key] ?? 0];
    if (!step) return;
    stepInFlight.current = key;
    setAutofillingSection(key);
    send("vendor-sync:autofill-field", {
      vendorId: connector.id,
      selector: step.selector,
      value: step.value,
      blockSection: t(`tools.vendorSync.steps.field.${step.field}`),
    });
    setTimeout(() => setAutofillingSection(null), 8_000);
  }, [connector.id, send, stepsFilled, t]);

  useEffect(() => {
    if (!open) return;
    setStepsFilled({});
    let cancelled = false;
    setLoading(true);
    setError(null);
    vendorSyncService
      .renderBlocks(connector.id, resumeId)
      .then((res) => {
        if (cancelled) return;
        setBlocks(res.blocks);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load blocks");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, connector.id, resumeId]);

  const handleCopy = useCallback(async (block: ExportBlock) => {
    try {
      await navigator.clipboard.writeText(block.text);
      const sectionLabel = block.section + (block.subSection ? ` — ${block.subSection}` : "");
      toast({
        title: t("tools.vendorSync.copiedToast", { section: sectionLabel }),
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: err instanceof Error ? err.message : "Clipboard not available",
        variant: "destructive",
      });
    }
  }, [toast, t]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("tools.vendorSync.dialog.title", { vendor: connector.label })}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="tools.vendorSync.dialog.description"
              values={{ title: resumeTitle, vendor: connector.label }}
              components={{ strong: <strong /> }}
            />
            {connector.editProfileUrl && (
              <>
                {" "}
                <a
                  href={connector.editProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  {t("tools.vendorSync.dialog.openEditor")} <ExternalLink className="h-3 w-3" />
                </a>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-md p-3">
            {error}
          </div>
        )}

        {!loading && !error && blocks.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            {t("tools.vendorSync.dialog.emptyState", { vendor: connector.label })}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {blocks.map((block, i) => {
            const blockKey = block.section + (block.subSection ?? "");
            return (
              <BlockCard
                key={`${block.section}-${block.subSection ?? ""}-${i}`}
                block={block}
                vendorLabel={connector.label}
                onCopy={() => handleCopy(block)}
                onAutofill={() => handleAutofill(block)}
                onAutofillStep={() => handleAutofillStep(block)}
                stepsFilled={stepsFilled[blockKey] ?? 0}
                onRestartSteps={() => setStepsFilled((prev) => ({ ...prev, [blockKey]: 0 }))}
                autofilling={autofillingSection === blockKey}
              />
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockCard({
  block,
  vendorLabel,
  onCopy,
  onAutofill,
  onAutofillStep,
  stepsFilled,
  onRestartSteps,
  autofilling,
}: {
  block: ExportBlock;
  vendorLabel: string;
  onCopy: () => void;
  onAutofill: () => void;
  onAutofillStep: () => void;
  stepsFilled: number;
  onRestartSteps: () => void;
  autofilling: boolean;
}) {
  const { t } = useTranslation();
  const overLimit = typeof block.charLimit === "number" && block.text.length > block.charLimit;
  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {block.section}
          {block.subSection && (
            <span className="text-muted-foreground font-normal">
              {" — "}{block.subSection}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {block.charLimit && (
            <Badge variant={overLimit ? "destructive" : "secondary"} className="text-xs">
              {block.text.length}/{block.charLimit}
            </Badge>
          )}
          {block.format === "markdown" && (
            <Badge variant="outline" className="text-xs">Markdown</Badge>
          )}
          {block.openTargetUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a
                href={block.openTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3 w-3 mr-1" /> {t("tools.vendorSync.button.open")}
              </a>
            </Button>
          )}
          {block.autofillSelector && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onAutofill}
              disabled={autofilling}
              title={t("tools.vendorSync.autofillTooltip", { section: block.section, vendor: vendorLabel })}
            >
              {autofilling ? (
                <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> {t("tools.vendorSync.button.filling")}</>
              ) : (
                <><Wand2 className="h-3 w-3 mr-1" /> {t("tools.vendorSync.button.autofill")}</>
              )}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onCopy}>
            <Copy className="h-3 w-3 mr-1" /> {t("tools.vendorSync.button.copy")}
          </Button>
        </div>
      </div>
      <pre className="text-xs whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-48 overflow-auto">
        {block.text}
      </pre>
      {block.autofillSteps && block.autofillSteps.length > 0 && (
        <AutofillStepper
          steps={block.autofillSteps}
          filled={stepsFilled}
          vendorLabel={vendorLabel}
          autofilling={autofilling}
          onFillNext={onAutofillStep}
          onRestart={onRestartSteps}
        />
      )}
    </div>
  );
}

/** One user-confirmed field at a time through a vendor's edit modal. */
function AutofillStepper({
  steps,
  filled,
  vendorLabel,
  autofilling,
  onFillNext,
  onRestart,
}: {
  steps: NonNullable<ExportBlock["autofillSteps"]>;
  filled: number;
  vendorLabel: string;
  autofilling: boolean;
  onFillNext: () => void;
  onRestart: () => void;
}) {
  const { t } = useTranslation();
  const next = steps[filled];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2">
      <p className="text-xs text-muted-foreground">{t("tools.vendorSync.steps.hint", { vendor: vendorLabel })}</p>
      <ol className="flex flex-wrap gap-1.5" aria-label={t("tools.vendorSync.steps.label")}>
        {steps.map((step, i) => (
          <li key={step.field}>
            <Badge variant={i < filled ? "default" : "outline"} className="gap-1 text-xs">
              {i < filled && <Check className="h-3 w-3" aria-hidden="true" />}
              {t(`tools.vendorSync.steps.field.${step.field}`)}
            </Badge>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {next ? (
          <Button size="sm" variant="secondary" onClick={onFillNext} disabled={autofilling}>
            {autofilling ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3 w-3 mr-1" aria-hidden="true" />
            )}
            {t("tools.vendorSync.steps.fillNext", {
              field: t(`tools.vendorSync.steps.field.${next.field}`),
              step: filled + 1,
              total: steps.length,
            })}
          </Button>
        ) : (
          <span className="text-xs font-medium text-foreground">
            {t("tools.vendorSync.steps.done", { vendor: vendorLabel })}
          </span>
        )}
        {filled > 0 && (
          <Button size="sm" variant="ghost" onClick={onRestart} disabled={autofilling}>
            <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
            {t("tools.vendorSync.steps.restart")}
          </Button>
        )}
      </div>
    </div>
  );
}

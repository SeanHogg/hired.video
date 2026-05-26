/**
 * VendorBlocksDialog — render the user's resume into vendor-shaped paste
 * blocks (LinkedIn About, Indeed Summary, GitHub README, ...). One card
 * per block with a Copy button and a charLimit indicator.
 *
 * Stateless beyond its own loading/error state — fetches blocks on open
 * and discards them on close.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Copy, Loader2, ExternalLink, Wand2 } from "lucide-react";
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

  useEffect(() => {
    if (!open) return;
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
  autofilling,
}: {
  block: ExportBlock;
  vendorLabel: string;
  onCopy: () => void;
  onAutofill: () => void;
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
    </div>
  );
}

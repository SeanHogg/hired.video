/**
 * VendorBlocksDialog — render the user's resume into vendor-shaped paste
 * blocks (LinkedIn About, Indeed Summary, GitHub README, ...). One card
 * per block with a Copy button and a charLimit indicator.
 *
 * Stateless beyond its own loading/error state — fetches blocks on open
 * and discards them on close.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ExportBlock[]>([]);

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
      toast({
        title: `Copied ${block.section}${block.subSection ? ` — ${block.subSection}` : ""}`,
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: err instanceof Error ? err.message : "Clipboard not available",
        variant: "destructive",
      });
    }
  }, [toast]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Paste-ready blocks for {connector.label}</DialogTitle>
          <DialogDescription>
            Rendered from <strong>{resumeTitle}</strong>. Copy each block and paste it into the matching section on {connector.label}.
            {connector.editProfileUrl && (
              <>
                {" "}
                <a
                  href={connector.editProfileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline"
                >
                  Open profile editor <ExternalLink className="h-3 w-3" />
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
            This resume doesn't have enough content to render blocks for {connector.label}.
            Add work experience, skills, and a summary to your master resume first.
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {blocks.map((block, i) => (
            <BlockCard
              key={`${block.section}-${block.subSection ?? ""}-${i}`}
              block={block}
              onCopy={() => handleCopy(block)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockCard({ block, onCopy }: { block: ExportBlock; onCopy: () => void }) {
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
          <Button size="sm" variant="ghost" onClick={onCopy}>
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
        </div>
      </div>
      <pre className="text-xs whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-48 overflow-auto">
        {block.text}
      </pre>
    </div>
  );
}

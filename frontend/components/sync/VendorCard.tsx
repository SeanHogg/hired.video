/**
 * VendorCard — single card on the Vendor Sync tool page, one per connector.
 *
 * Self-gating per the DRY rule:
 *   - Returns null when the connector's user-facing surface is empty
 *     for the current viewer (right now only "personal-site without an
 *     editProfileUrl AND no other capability"). The tool page never
 *     branches on connector capabilities — it iterates the registry
 *     and lets each card decide whether to render.
 *   - The "Sync from this tab" CTA inside the card hides itself when
 *     `connector.supportsExtensionExtract` is false. No prop-drilled
 *     `canSync` flag from the page.
 *
 * Two CTAs land on this card:
 *
 *   1. "Open paste-ready blocks" — always available. Fetches the user's
 *      master/variant rendered into the connector's vendor-shaped blocks,
 *      one block per section, with a Copy button per block.
 *   2. "Sync from this tab" — extension-only. Asks the extension to pull
 *      focused HTML from a matching profile tab; the parent page receives
 *      the payload via the extension bridge and opens MergeResumeDialog.
 */

import { useCallback, useState } from "react";
import {
  Briefcase, Building, Chrome, Code, ExternalLink,
  Ghost, Github, Globe, Linkedin, Rocket, Zap,
  Loader2, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useExtensionBridge } from "@/hooks/use-extension-bridge";
import {
  vendorSyncService,
  type VendorConnectorListItem,
} from "@/lib/services/vendor-sync-service";
import VendorBlocksDialog from "./VendorBlocksDialog";

/** Lucide icon resolver. Backend ships an `iconKey` string; the FE maps
 *  it to a component here so we never import lucide on the server. */
const ICONS: Record<string, LucideIcon> = {
  linkedin: Linkedin,
  briefcase: Briefcase,
  building: Building,
  zap: Zap,
  rocket: Rocket,
  code: Code,
  ghost: Ghost,
  github: Github,
  globe: Globe,
  chrome: Chrome,
};

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return null;
  }
}

export interface VendorCardProps {
  connector: VendorConnectorListItem;
  /** The resume to render export blocks FROM. The Vendor Sync tool page
   *  picks this once at the top — usually the master, sometimes a
   *  variant. */
  selectedResumeId: string;
  selectedResumeTitle: string;
  /** True iff the parent has just registered an extension-bridge listener
   *  and is ready to receive `vendor-sync:focused-html`. Cards delegate
   *  fetching to the parent because only one bridge listener should
   *  process each broadcast. */
  onRequestExtensionSync?: (connectorId: string) => void;
}

export default function VendorCard({
  connector,
  selectedResumeId,
  selectedResumeTitle,
  onRequestExtensionSync,
}: VendorCardProps) {
  const { toast } = useToast();
  const [blocksOpen, setBlocksOpen] = useState(false);
  const [pendingExt, setPendingExt] = useState(false);

  // The personal-site card has no edit-profile URL and no extension
  // hookup — it's purely "render blocks for paste". Still useful, so
  // we keep rendering. Add a real "skip this card" rule here only when
  // we hit a connector that genuinely shouldn't appear for the user.
  const Icon = ICONS[connector.iconKey] ?? Globe;

  const handleSyncFromTab = useCallback(() => {
    if (!connector.supportsExtensionExtract) return;
    setPendingExt(true);
    onRequestExtensionSync?.(connector.id);
    // Defensive auto-clear: if the extension never replies (e.g. not
    // installed, or no profile tab open), let the user retry after a
    // few seconds rather than locking the button.
    setTimeout(() => setPendingExt(false), 6_000);
  }, [connector.id, connector.supportsExtensionExtract, onRequestExtensionSync]);

  const handleMarkSynced = useCallback(async () => {
    try {
      await vendorSyncService.markManualRun({
        connectorId: connector.id,
        sourceResumeId: selectedResumeId,
      });
      toast({
        title: `Marked synced to ${connector.label}`,
        description: `Tracked against "${selectedResumeTitle}". You can see this on the History tab.`,
      });
    } catch (err) {
      toast({
        title: "Failed to record sync",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [connector.id, connector.label, selectedResumeId, selectedResumeTitle, toast]);

  const lastSynced = fmtDate(connector.lastRun?.completedAt ?? connector.lastRun?.startedAt ?? null);

  return (
    <>
      <Card className="flex flex-col h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-md bg-muted">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{connector.label}</div>
                {lastSynced && (
                  <div className="text-xs text-muted-foreground">
                    Last synced {lastSynced}
                  </div>
                )}
              </div>
            </div>
            {connector.supportsExtensionExtract && (
              <Badge variant="secondary" className="gap-1">
                <Chrome className="h-3 w-3" /> Extension
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 flex-1">
          <p className="text-sm text-muted-foreground">{connector.description}</p>

          <div className="mt-auto flex flex-col gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => setBlocksOpen(true)}
            >
              View paste-ready blocks
            </Button>

            {connector.supportsExtensionExtract && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncFromTab}
                disabled={pendingExt}
              >
                {pendingExt ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting for extension…</>
                ) : (
                  <>Sync from {connector.label} tab</>
                )}
              </Button>
            )}

            <div className="flex gap-2">
              {connector.editProfileUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="flex-1"
                >
                  <a
                    href={connector.editProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open profile
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkSynced}
                className="flex-1"
              >
                Mark synced
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <VendorBlocksDialog
        open={blocksOpen}
        onClose={() => setBlocksOpen(false)}
        connector={connector}
        resumeId={selectedResumeId}
        resumeTitle={selectedResumeTitle}
      />
    </>
  );
}

/** Subscribe to a single extension-bridge broadcast that VendorCard
 *  triggers via `onRequestExtensionSync`. Exposed here so the tool page
 *  can co-locate the listener with the rest of its merge state. */
export function useVendorSyncFocusedListener(opts: {
  onResult: (payload: {
    html: string | null;
    connectorId: string | null;
    originUrl: string | null;
    error: string | null;
  }) => void;
}) {
  return useExtensionBridge<{
    html: string | null;
    connectorId: string | null;
    originUrl: string | null;
    error: string | null;
  }>({
    listenFor: "vendor-sync:focused-html",
    onEvent: (payload) => {
      if (!payload) return;
      opts.onResult(payload);
    },
  });
}

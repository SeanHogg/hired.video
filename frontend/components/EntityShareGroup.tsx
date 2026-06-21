// EntityShareGroup — the "Share / Copy Link / QR Code / Embed" cluster
// shared by every entity-action menu (resume, job, company, person).
//
// Sharing logic is NOT re-implemented here: when `shareUrl` is provided the
// group renders the reusable <ShareMenuItems> (LinkedIn / X / Facebook /
// WhatsApp / Email / copy link / native share — the SAME set the standalone
// <ShareMenu> uses on cards), so every actions-menu and every card share the
// one source of truth. QR / Embed stay here because they're entity-surface
// concerns, not generic web-share targets.
//
// Self-gating per the standing DRY rule:
//   - returns null when there's nothing to render
//   - emits its own leading separator only when there's something else
//     above it in the parent menu (controlled via `withSeparator`)
//   - each individual item only renders if its input is provided
//
// `onShare` / `onCopyLink` remain as a LEGACY fallback for callers that don't
// (yet) have a shareable URL — when `shareUrl` is set, the rich social set
// supersedes them.

import { Share2, Link2, QrCode, Code2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ShareMenuItems } from "@/components/share/ShareMenu";

export interface EntityShareGroupProps {
  /** Canonical absolute URL of the entity. When set, the group renders the
   *  full social share set (preferred). */
  shareUrl?: string;
  shareTitle?: string;
  shareText?: string;
  /** Legacy generic-share fallback — used only when `shareUrl` is absent. */
  onShare?: () => void;
  /** Legacy copy-link fallback — used only when `shareUrl` is absent
   *  (the rich set already includes Copy link). */
  onCopyLink?: () => void;
  onShowQR?: () => void;
  onEmbed?: () => void;
  /** Whether to render a leading `<DropdownMenuSeparator />`. The parent
   *  decides this based on whether anything precedes the share group in
   *  its own menu. */
  withSeparator?: boolean;
}

export function EntityShareGroup({
  shareUrl,
  shareTitle,
  shareText,
  onShare,
  onCopyLink,
  onShowQR,
  onEmbed,
  withSeparator = true,
}: EntityShareGroupProps): JSX.Element | null {
  const rich = Boolean(shareUrl);
  if (!rich && !onShare && !onCopyLink && !onShowQR && !onEmbed) return null;

  return (
    <>
      {withSeparator && <DropdownMenuSeparator />}

      {rich ? (
        <ShareMenuItems url={shareUrl!} title={shareTitle} text={shareText} />
      ) : (
        <>
          {onShare && (
            <DropdownMenuItem onClick={onShare}>
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </DropdownMenuItem>
          )}
          {onCopyLink && (
            <DropdownMenuItem onClick={onCopyLink}>
              <Link2 className="w-4 h-4 mr-2" />
              Copy Link
            </DropdownMenuItem>
          )}
        </>
      )}

      {onShowQR && (
        <DropdownMenuItem onClick={onShowQR}>
          <QrCode className="w-4 h-4 mr-2" />
          QR Code
        </DropdownMenuItem>
      )}
      {onEmbed && (
        <DropdownMenuItem onClick={onEmbed}>
          <Code2 className="w-4 h-4 mr-2" />
          Embed
        </DropdownMenuItem>
      )}
    </>
  );
}

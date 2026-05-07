// EntityShareGroup — the "Share / Copy Link / QR Code / Embed" cluster
// shared by every entity-action menu (resume, job, company, person).
//
// Self-gating per the standing DRY rule:
//   - returns null when none of the share callbacks are provided
//   - emits its own leading separator only when there's something else
//     above it in the parent menu (controlled via `withSeparator`)
//   - each individual item only renders if its callback is provided
//
// Importing menus get a single drop-in element instead of re-implementing
// four DropdownMenuItems + the separator logic per-entity.

import { Share2, Link2, QrCode, Code2 } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface EntityShareGroupProps {
  onShare?: () => void;
  onCopyLink?: () => void;
  onShowQR?: () => void;
  onEmbed?: () => void;
  /** Whether to render a leading `<DropdownMenuSeparator />`. The parent
   *  decides this based on whether anything precedes the share group in
   *  its own menu. */
  withSeparator?: boolean;
}

export function EntityShareGroup({
  onShare,
  onCopyLink,
  onShowQR,
  onEmbed,
  withSeparator = true,
}: EntityShareGroupProps): JSX.Element | null {
  if (!onShare && !onCopyLink && !onShowQR && !onEmbed) return null;
  return (
    <>
      {withSeparator && <DropdownMenuSeparator />}
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

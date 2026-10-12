/**
 * CollabPresenceBar — live "who else is editing" chip for the studio editor
 * header (gap #2243). Renders stacked initial-avatars for the remote
 * collaborators currently in the room plus a localized count.
 *
 * Self-gating per the shared-component rule: returns null unless the room is
 * connected AND at least one OTHER editor is present, so a solo session shows
 * nothing and the consumer doesn't thread a `showPresence` boolean.
 */

import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CollabPeer } from "@/lib/studio/collab/use-studio-room";

/** Deterministic accent per peer so the same person keeps the same colour
 *  across the session — hashed from the stable userId. */
const PEER_COLORS = [
  "bg-rose-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-sky-500",
  "bg-teal-500",
];

function peerColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PEER_COLORS[Math.abs(hash) % PEER_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MAX_VISIBLE = 4;

export default function CollabPresenceBar({
  connected,
  peers,
}: {
  connected: boolean;
  peers: CollabPeer[];
}) {
  const { t } = useTranslation();
  if (!connected || peers.length === 0) return null;

  const visible = peers.slice(0, MAX_VISIBLE);
  const overflow = peers.length - visible.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex items-center gap-1.5"
        role="status"
        aria-live="polite"
        aria-label={t("studio.collab.editingCount", { count: peers.length })}
      >
        <div className="flex -space-x-2">
          {visible.map((p) => (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <Avatar className="h-6 w-6 ring-2 ring-background">
                  <AvatarFallback className={cn("text-[10px] font-semibold text-white", peerColor(p.userId))}>
                    {initials(p.displayName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{p.displayName}</TooltipContent>
            </Tooltip>
          ))}
          {overflow > 0 && (
            <Avatar className="h-6 w-6 ring-2 ring-background">
              <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
                +{overflow}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {t("studio.collab.editingCount", { count: peers.length })}
        </span>
      </div>
    </TooltipProvider>
  );
}

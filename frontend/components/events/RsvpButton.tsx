/**
 * RsvpButton — single, self-gating RSVP control used on every event surface.
 *
 * Decides its own state from the resolved event + viewer's existing RSVP:
 *   • viewer is host or co-host         → "Manage" link to detail page (no RSVP)
 *   • event cancelled                    → disabled "Cancelled"
 *   • capacity full + viewer not going   → "Join waitlist"
 *   • requiresApproval + viewer pending  → "Pending approval" disabled
 *   • viewer already going               → "Going · Change" with menu
 *   • everyone else                      → "RSVP" primary
 *
 * Per the DRY rule, no consumer passes prop-drilled flags like
 * `canRsvp`/`isFull`/`needsApproval` — they're derived from the event +
 * viewerRsvp shape directly.
 */
import { useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { eventsService } from "@/lib/services/events-service";
import { useAuth } from "@/lib/auth";
import { useNavigate } from "react-router-dom";
import type { ResolvedEvent } from "@shared/events";

interface RsvpButtonProps {
  event: ResolvedEvent;
  onChange?: (next: ResolvedEvent) => void;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function RsvpButton({ event, onChange, size = "default", className }: RsvpButtonProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  if (event.viewerIsHost || event.viewerIsCoHost) {
    return (
      <Button asChild size={size} variant="outline" className={className}>
        <Link to={`/events/${event.slug ?? event.id}/manage`}>Manage event</Link>
      </Button>
    );
  }

  if (event.cancelledAt) {
    return (
      <Button size={size} disabled className={className}>
        Cancelled
      </Button>
    );
  }

  const viewerStatus = event.viewerRsvp?.status ?? null;
  const isFull = event.capacity != null && event.attendeeCount >= event.capacity;

  async function setStatus(next: "going" | "maybe" | "declined" | "cancelled") {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(`/events/${event.slug ?? event.id}`)}`);
      return;
    }
    setBusy(true);
    try {
      await eventsService.rsvp(event.id, { status: next, plusOneCount: 0 });
      // Refetch the canonical event so attendeeCount/viewerRsvp are accurate.
      const fresh = await eventsService.get(event.slug ?? event.id);
      onChange?.(fresh);
    } finally {
      setBusy(false);
    }
  }

  // Pending approval — show disabled label.
  if (viewerStatus === "going" && event.viewerRsvp?.approvalStatus === "pending") {
    return (
      <Button size={size} disabled className={className}>
        Pending approval
      </Button>
    );
  }

  // Currently going / waitlisted — show change menu.
  if (viewerStatus === "going" || viewerStatus === "maybe" || viewerStatus === "waitlist") {
    const isWaitlist = viewerStatus === "waitlist";
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size={size} variant={isWaitlist ? "outline" : "default"} className={className}>
            {busy || pending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            {isWaitlist ? "On waitlist" : viewerStatus === "going" ? "Going" : "Maybe"}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {viewerStatus !== "going" && !isFull && (
            <DropdownMenuItem onClick={() => startTransition(() => { void setStatus("going"); })}>
              Going
            </DropdownMenuItem>
          )}
          {viewerStatus !== "maybe" && (
            <DropdownMenuItem onClick={() => startTransition(() => { void setStatus("maybe"); })}>
              Maybe
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => startTransition(() => { void setStatus("cancelled"); })}>
            Cancel my RSVP
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Brand-new RSVP path.
  const label = isFull
    ? "Join waitlist"
    : event.requiresApproval
      ? "Request to RSVP"
      : "RSVP";

  return (
    <Button
      size={size}
      className={className}
      disabled={busy || pending}
      onClick={() => startTransition(() => { void setStatus("going"); })}
    >
      {(busy || pending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {label}
    </Button>
  );
}

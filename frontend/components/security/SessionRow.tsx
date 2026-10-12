/**
 * SessionRow — single source of truth for rendering one session in
 * the /security/sessions list.
 *
 * Self-gates the revoke button — the row knows whether it represents
 * the current device (via session.current from the backend) and renders
 * a disabled "This device" pill instead of an active "Sign out" button.
 * Parents do NOT pass canRevoke / isCurrent props.
 */

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SessionRow as SessionRowData } from "@/lib/services/sessions-service";

type Props = {
  session: SessionRowData;
  onRevoke: (id: string) => Promise<void>;
};

export function SessionRow({ session, onRevoke }: Props) {
  const [pending, setPending] = useState(false);

  const handleRevoke = async () => {
    if (session.current) return; // Self-gate; safety net even though button is hidden.
    setPending(true);
    try {
      await onRevoke(session.id);
    } finally {
      setPending(false);
    }
  };

  const lastSeen = formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true });

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">
            {session.deviceLabel ?? "Unknown device"}
          </span>
          {session.current && (
            <Badge variant="secondary" className="text-xs">This device</Badge>
          )}
          {session.trusted && (
            <Badge variant="outline" className="text-xs">Trusted</Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {session.ipAddress ?? "Unknown IP"}
          {session.ipCountry ? ` · ${session.ipCountry}` : ""} · last active {lastSeen}
        </div>
      </div>
      {session.current ? (
        <span className="text-xs text-muted-foreground">Current</span>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRevoke}
          disabled={pending}
        >
          {pending ? "Signing out…" : "Sign out"}
        </Button>
      )}
    </div>
  );
}

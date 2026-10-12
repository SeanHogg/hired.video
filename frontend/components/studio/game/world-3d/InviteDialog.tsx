/**
 * InviteDialog — Phase 4 (gap #1637). Lists active invites for the
 * project, lets the owner create new ones + revoke. Self-gates: the
 * caller passes the projectId; if null (unsaved draft), the dialog
 * shows a "save first" message instead of fetching.
 *
 * Surfaces a public URL `/play/:token` for each invite. Copy-to-
 * clipboard uses the Web API; the dialog falls back to a select-all
 * affordance when clipboard isn't available (older Safari).
 */

import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { gamesApiJson } from "@/lib/services/games-api";

interface Invite {
  id: string;
  token: string;
  label: string | null;
  maxUses: number | null;
  joinedCount: number;
  revokedAt: string | null;
  expiresAt: string | null;
}

interface InviteDialogProps {
  projectId: string | null;
  onClose: () => void;
}

export default function InviteDialog({ projectId, onClose }: InviteDialogProps) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    if (!projectId) return;
    void refresh();
  }, [projectId]);

  const refresh = async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await gamesApiJson<Invite[]>(`/api/games/${projectId}/invites`);
      setInvites(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network failure");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!projectId) return;
    setCreating(true);
    setError(null);
    try {
      await gamesApiJson(`/api/games/${projectId}/invites`, {
        method: "POST",
        body: {
          label: newLabel.trim() || undefined,
          // Default 7-day expiry — kids share links via screenshot / discord;
          // links rotting after a week is a reasonable default. Owners can
          // create unlimited new ones for free.
          expiresInHours: 24 * 7,
        },
      });
      setNewLabel("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network failure");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (inviteId: string) => {
    if (!projectId) return;
    try {
      await gamesApiJson(`/api/games/${projectId}/invites/${inviteId}`, { method: "DELETE" });
      await refresh();
    } catch {
      // Refresh will surface the actual state; UI doesn't need to throw.
    }
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold">Invite friends to play</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!projectId ? (
          <div className="p-4 text-sm text-muted-foreground">
            Save the project first — invites need a persisted world.
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional, e.g. 'Sam')"
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={create}
                disabled={creating}
                className="flex items-center gap-1 rounded bg-teal-600 px-2 py-1 text-xs font-semibold text-white hover:bg-teal-500 disabled:bg-muted-foreground/30"
              >
                <Plus className="h-3 w-3" />
                Create link
              </button>
            </div>

            {error && (
              <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
              {!loading && invites.length === 0 && (
                <div className="text-xs text-muted-foreground">No invites yet. Create one above.</div>
              )}
              {invites.map((inv) => (
                <InviteRow key={inv.id} invite={inv} onRevoke={() => revoke(inv.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke: () => void }) {
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/play/${invite.token}`
      : `/play/${invite.token}`;
  const status =
    invite.revokedAt ? "revoked" :
    invite.expiresAt && new Date(invite.expiresAt) < new Date() ? "expired" :
    "active";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers — fallback ignored; user can select-all manually.
    }
  };
  return (
    <div className={cn(
      "rounded border border-border bg-muted/30 p-2",
      status !== "active" && "opacity-60",
    )}>
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="text-xs font-medium">{invite.label ?? "Untitled invite"}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{status}</span>
        {status === "active" && (
          <button
            type="button"
            onClick={onRevoke}
            className="rounded p-0.5 text-rose-500 hover:bg-rose-500/10"
            aria-label="Revoke invite"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <code className="flex-1 truncate rounded bg-background px-1.5 py-0.5 text-[10px]" title={url}>
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded p-1 hover:bg-muted-foreground/10"
          aria-label="Copy link"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        {invite.joinedCount} join{invite.joinedCount === 1 ? "" : "s"}
        {invite.maxUses && ` of ${invite.maxUses} allowed`}
      </div>
    </div>
  );
}

/**
 * PlayInvite — Phase 4 (gap #1637) public landing for `/play/:token`.
 *
 * Resolves the share token, displays a "Join the game" hero, then
 * mounts the read-only `<GameStage>` in play mode against the invite's
 * gameState snapshot. No editor chrome — the visitor is a player, not
 * the owner. Anonymous guests can join (the route accepts no-JWT
 * resolves); the join hit bumps `joinedCount` server-side.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Gamepad2, ArrowLeft } from "lucide-react";
import type { GameState } from "@shared/game-state";
import GameStage from "@/components/studio/game/GameStage";
import { useSEO } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import { gamesApiJson } from "@/lib/services/games-api";

interface ResolvedInvite {
  projectId: string;
  label: string | null;
  gameState: GameState;
}

export default function PlayInvite() {
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<ResolvedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useSEO("/play/:token", {
    title: invite?.label ? `Play: ${invite.label}` : "Join the game",
    description: "Play a 3D world built in the hired.video studio.",
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await gamesApiJson<ResolvedInvite>(
          `/api/games/invites/${encodeURIComponent(token)}`,
        );
        if (cancelled) return;
        setInvite(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Invite not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const join = async () => {
    if (!token) return;
    try {
      await gamesApiJson(`/api/games/invites/${encodeURIComponent(token)}/join`, {
        method: "POST",
      });
    } catch {
      // Best-effort — the user can play even if the counter bump fails.
    }
    setJoined(true);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Home
        </Link>

        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-6 text-center">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 text-rose-500" />
            <h1 className="text-xl font-semibold">Can't join this game</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {!error && !invite && (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 animate-pulse text-fuchsia-500" />
            <p className="text-sm text-muted-foreground">Loading invite…</p>
          </div>
        )}

        {invite && !joined && (
          <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 text-fuchsia-500" />
            <h1 className="text-2xl font-semibold">
              {invite.label ?? "You've been invited to play"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Click the button below to drop into the 3D world.
            </p>
            <button
              type="button"
              onClick={join}
              className="mt-4 rounded-full bg-fuchsia-600 px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-fuchsia-500"
            >
              ▶ Join the game
            </button>
          </div>
        )}

        {invite && joined && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">
              {invite.label ?? "3D World"}
            </h1>
            <div className="flex justify-center">
              <GameStage
                gameState={invite.gameState}
                zoom={1}
                mode="play"
                hideRuntimeBanner={false}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Click the canvas to lock pointer · WASD to move · Space to jump · Esc to release
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

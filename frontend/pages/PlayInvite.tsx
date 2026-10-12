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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [invite, setInvite] = useState<ResolvedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useSEO("/play/:token", {
    title: invite?.label ? t("playInvite.seoTitleNamed", { label: invite.label }) : t("playInvite.join"),
    description: t("playInvite.seoDescription"),
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
        if (!cancelled) setError(e instanceof Error ? e.message : t("playInvite.notFound"));
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
          className="mb-4 inline-flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          {t("labels.home")}
        </Link>

        {error && (
          <div className="rounded-[20px] border border-destructive/40 bg-destructive/10 p-6 text-center">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 text-destructive" aria-hidden="true" />
            <h1 className="font-display text-xl font-bold">{t("playInvite.cantJoin")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {!error && !invite && (
          <div className="rounded-[20px] border border-dashed border-border bg-muted/30 p-6 text-center">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 animate-pulse text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("playInvite.loading")}</p>
          </div>
        )}

        {invite && !joined && (
          <div className="rounded-[20px] border border-border bg-card p-6 text-center">
            <Gamepad2 className="mx-auto mb-2 h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="font-display text-2xl font-bold">
              {invite.label ?? t("playInvite.invitedTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("playInvite.invitedBody")}
            </p>
            <button
              type="button"
              onClick={join}
              className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("playInvite.join")}
            </button>
          </div>
        )}

        {invite && joined && (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold">
              {invite.label ?? t("playInvite.worldFallback")}
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
              {t("playInvite.controls")}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

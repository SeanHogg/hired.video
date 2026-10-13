/**
 * One channel card in the Post dock: name, a check box when the account is
 * connected (the whole card toggles), or a Connect button when it isn't.
 * At the free plan's channel cap an unpicked card is locked and carries a
 * PRO badge instead of the box. The mono line under the name carries the
 * connect state — or, for the profile (nothing to connect), what it is.
 * Under the card: where it is already posted (with its link, and what
 * posting again does), how the video fits the network's preset, or a failure.
 */
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import type { PublishOutcome } from "@/lib/studio/use-publish-handlers";
import { useShareChannelLabel } from "./useShareChannelLabel";

export interface ShareChannelRowProps {
  channel: ShareChannelId;
  connected: boolean;
  selected: boolean;
  /** At the free plan's channel cap — picking this one needs Pro. */
  locked: boolean;
  connecting: boolean;
  disabled: boolean;
  result?: PublishOutcome;
  /** How the video fits this network (too long, reframed, posts as a Short). */
  fitNote?: string | null;
  /** This video is already posted here (its live link, when known). */
  posted?: { url: string | null } | null;
  onToggle: () => void;
  onConnect: () => void;
}

const CARD = "flex min-h-[60px] w-full flex-col items-start gap-1 rounded-xl bg-card text-left text-foreground";

export default function ShareChannelRow({
  channel,
  connected,
  selected,
  locked,
  connecting,
  disabled,
  result,
  fitNote,
  posted,
  onToggle,
  onConnect,
}: ShareChannelRowProps) {
  const { t } = useTranslation();
  const label = useShareChannelLabel()(channel);
  const failure =
    result && !result.ok
      ? result.reason === "not-connected"
        ? t("studio.share.reconnect")
        : result.message || t("messages.publishFailedTitle")
      : null;
  const on = connected && selected;
  const status = channel === "profile" ? t("studio.share.channel.profileHint") : t("labels.connected");

  return (
    <li className="flex flex-col gap-1">
      {connected ? (
        <button
          type="button"
          aria-pressed={on}
          aria-disabled={locked || undefined}
          onClick={locked ? undefined : onToggle}
          disabled={disabled}
          title={locked ? t("studio.share.lockedHint") : undefined}
          className={cn(
            CARD,
            "transition-colors disabled:cursor-default disabled:opacity-60",
            on
              ? "cursor-pointer border-2 border-primary px-[11px] py-[9px]"
              : locked
                ? "cursor-default border border-border bg-muted/50 px-3 py-2.5"
                : "cursor-pointer border border-border px-3 py-2.5 hover:border-input",
          )}
        >
          <span className="flex w-full items-center justify-between gap-1.5">
            <strong className="text-sm">{label}</strong>
            {on ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
              </span>
            ) : locked ? (
              <span className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/80">
                {t("studio.share.proBadge")}
                <span className="sr-only"> — {t("studio.share.lockedHint")}</span>
              </span>
            ) : (
              <span className="h-[18px] w-[18px] rounded-md border-[1.5px] border-input" aria-hidden="true" />
            )}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{status}</span>
        </button>
      ) : (
        <div className={cn(CARD, "border border-border bg-muted/50 px-3 py-2.5")}>
          <span className="flex w-full items-center justify-between gap-1.5">
            <strong className="text-sm">{label}</strong>
            <button
              type="button"
              onClick={onConnect}
              disabled={disabled || connecting}
              className="flex min-h-9 items-center gap-1 rounded-lg border border-input bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {connecting && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {t("actions.connect")}
            </button>
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{t("studio.share.notConnected")}</span>
        </div>
      )}
      {posted && !failure && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Check className="h-3 w-3 text-brand-green-text" strokeWidth={3} aria-hidden="true" />
          <span>{t("studio.share.channel.alreadyPosted")}</span>
          {posted.url && (
            <a
              href={posted.url}
              target={posted.url.startsWith("http") ? "_blank" : undefined}
              rel={posted.url.startsWith("http") ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              {t("studio.share.viewPost")}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
          {on && (
            <span>
              ·{" "}
              {channel === "profile" ? t("studio.share.channel.updatesProfile") : t("studio.share.channel.postsAgain")}
            </span>
          )}
        </p>
      )}
      {fitNote && !failure && <p className="text-xs text-muted-foreground">{fitNote}</p>}
      {failure && (
        <p className="text-xs text-destructive" role="alert">
          {failure}
        </p>
      )}
    </li>
  );
}

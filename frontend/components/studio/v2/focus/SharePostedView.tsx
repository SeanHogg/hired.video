/**
 * SharePostedView — the Post dock's "posted" state: a POSTED eyebrow, the
 * channels that went out (each with its View link), the shareable profile
 * link with Copy, then (free users only) the single Pro offer, or a short
 * Pro confirmation.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import type { PublishOutcome } from "@/lib/studio/use-publish-handlers";
import ProUpsellCard from "./ProUpsellCard";
import { useShareChannelLabel } from "./useShareChannelLabel";

export interface SharePostedViewProps {
  channels: ShareChannelId[];
  results: Partial<Record<ShareChannelId, PublishOutcome>>;
  isPro: boolean;
  onPostAgain: () => void;
  onNavigate: () => void;
}

function absoluteUrl(url: string): string {
  return url.startsWith("http") ? url : `${window.location.origin}${url}`;
}

export default function SharePostedView({ channels, results, isPro, onPostAgain, onNavigate }: SharePostedViewProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const labelOf = useShareChannelLabel();
  const posted = channels.filter((c) => results[c]?.ok);
  const failed = channels.some((c) => results[c] && !results[c]?.ok);
  const profile = results.profile;
  const shareLink = profile?.ok && profile.url ? absoluteUrl(profile.url) : null;
  const firstName = user?.firstName?.trim();

  const copyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({ title: t("messages.linkCopiedTitle") });
    } catch {
      // Clipboard blocked — the link stays visible to copy by hand.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold uppercase text-brand-green-text" role="status">
        <span className="h-2 w-2 rounded-full bg-brand-green" aria-hidden="true" />
        {t("studio.share.posted")}
      </p>
      <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">
        {firstName ? t("studio.share.outThereName", { name: firstName }) : t("studio.share.outThere")}
      </h2>
      <ul className="flex flex-col">
        {posted.map((channel) => {
          const outcome = results[channel];
          const url = outcome?.ok ? outcome.url : null;
          return (
            <li key={channel} className="flex justify-between gap-2.5 border-b border-border py-2 text-sm">
              <span>{labelOf(channel)}</span>
              {url && (
                <a
                  href={url}
                  target={url.startsWith("http") ? "_blank" : undefined}
                  rel={url.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="text-primary hover:underline"
                >
                  {t("studio.share.viewPost")}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          {t("studio.share.someFailed")}
        </p>
      )}
      {shareLink && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-[1_1_200px] truncate rounded-[10px] bg-background px-3 py-2.5 font-mono text-[13px]">
            {shareLink.replace(/^https?:\/\//, "")}
          </span>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="min-h-[42px] rounded-[10px] border border-input bg-card px-3.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {t("actions.copyLink")}
          </button>
        </div>
      )}
      {isPro ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] bg-brand-green/10 p-3.5 ring-1 ring-inset ring-brand-green/30">
          <span className="flex-[1_1_220px] text-sm leading-normal text-brand-green-text">
            {t("studio.share.proActive")}
          </span>
          <button
            type="button"
            onClick={onPostAgain}
            className="min-h-[42px] rounded-[10px] bg-ink px-3.5 text-sm font-semibold text-ink-foreground hover:bg-ink/90"
          >
            {t("studio.share.postAgain")}
          </button>
        </div>
      ) : (
        <>
          <ProUpsellCard onNavigate={onNavigate} />
          <button
            type="button"
            onClick={onPostAgain}
            className="min-h-11 self-start text-[13px] text-primary hover:underline"
          >
            {t("studio.share.postAgain")}
          </button>
        </>
      )}
    </div>
  );
}

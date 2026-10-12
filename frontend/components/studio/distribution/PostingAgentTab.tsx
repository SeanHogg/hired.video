/**
 * Agent tab in the Distribution Hub (#2300 / #2814 / #2826).
 * Pro users configure cadence, channels, quiet hours, and approve drafts.
 */
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ProUpsellCard from "@/components/studio/v2/focus/ProUpsellCard";
import { PostingAgentDrafts } from "@/components/studio/distribution/PostingAgentDrafts";
import { PostingAgentSettingsCard } from "@/components/studio/distribution/PostingAgentSettingsCard";
import { usePostingAgent } from "@/components/studio/distribution/usePostingAgent";

export function PostingAgentTab() {
  const { t } = useTranslation();
  const agent = usePostingAgent();

  if (agent.subLoading) {
    return <p className="text-sm text-muted-foreground">{t("studio.agent.loading")}</p>;
  }

  if (!agent.isPro) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h2 className="font-display text-lg font-bold text-foreground">{t("studio.agent.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("studio.agent.proRequired")}</p>
        </header>
        <ProUpsellCard />
      </div>
    );
  }

  if (!agent.settings) {
    return (
      <p className="text-sm text-muted-foreground">
        {agent.loadError ? t("studio.agent.loadError") : t("studio.agent.loading")}
      </p>
    );
  }

  if (!agent.settings.globallyEnabled) {
    return (
      <div>
        <h2 className="font-display text-lg font-bold text-foreground">{t("studio.agent.title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("studio.agent.disabledGlobal")}</p>
      </div>
    );
  }

  const form = agent.settings;
  const showTokens = agent.outOfTokens || form.pausedReason === "plan";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-display text-lg font-bold text-foreground">{t("studio.agent.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("studio.agent.subtitle")}</p>
      </header>

      {form.pausedReason === "admin" ? (
        <p className="text-sm text-muted-foreground">{t("studio.agent.pausedAdmin")}</p>
      ) : null}

      {showTokens ? (
        <p className="text-sm text-muted-foreground">
          {t("studio.agent.outOfTokens")}{" "}
          <Link to="/billing" className="font-semibold text-primary underline-offset-2 hover:underline">
            {t("studio.agent.buyTokens")}
          </Link>
        </p>
      ) : null}

      {agent.proRequired ? <p className="text-sm text-muted-foreground">{t("studio.agent.proRequired")}</p> : null}
      {agent.saveError ? <p className="text-sm text-destructive">{t("studio.agent.saveError")}</p> : null}
      {agent.loadError ? <p className="text-sm text-destructive">{t("studio.agent.loadError")}</p> : null}

      <PostingAgentSettingsCard
        form={form}
        busy={agent.busy !== null}
        onChange={agent.setSettings}
        onSave={agent.save}
        onStart={agent.start}
        onPause={agent.pause}
        onToggleEnabled={agent.toggleEnabled}
      />

      <PostingAgentDrafts
        drafts={agent.drafts}
        captions={agent.captions}
        busy={agent.busy !== null}
        pausedReason={form.pausedReason}
        prepareProgress={agent.busy === "prepare" ? agent.prepareProgress : null}
        onCaption={agent.setCaption}
        onApprove={agent.approve}
        onSkip={agent.skip}
        onRewrite={agent.rewrite}
        onUndo={agent.undo}
        onApproveAll={agent.approveAll}
        onPrepareClips={agent.prepareClips}
      />
    </div>
  );
}

export default PostingAgentTab;

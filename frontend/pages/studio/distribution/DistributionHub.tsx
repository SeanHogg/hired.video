/**
 * /studio/distribution — the Distribution Hub (#2047, PRD §4.2): compose one
 * post of a rendered video, send it to several destinations — your own
 * accounts, hired.video's brand channels (reviewed first), the hired.video
 * feed — now or at a time, and follow every post in the queue (upcoming,
 * sent, failed) with cancel and retry. `?project=&manual=` opens the
 * manual-upload card for a destination that forbids direct posting.
 *
 * Signed-in only (the route wraps RequireAuth); a guest session sees why it
 * needs an account. The queue itself is the server's (social_publish_jobs,
 * drained every 5 minutes) — this page only composes and lists.
 */
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { useBreadcrumbs, useSEO } from "@/lib/seo";
import { APP_CARD_SURFACE, APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { cn } from "@/lib/utils";
import DistributionComposer from "@/components/studio/distribution/DistributionComposer";
import DistributionJobList from "@/components/studio/distribution/DistributionJobList";
import { useDistributionComposer } from "@/components/studio/distribution/useDistributionComposer";
import ManualUploadFromLink from "@/components/studio/distribution/ManualUploadFromLink";
import { PostingAgentTab } from "@/components/studio/distribution/PostingAgentTab";

export default function DistributionHub() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  useSEO("/studio/distribution");
  useBreadcrumbs([
    { name: t("labels.studio"), url: "/studio" },
    { name: t("distribution.title"), url: "/studio/distribution" },
  ]);
  const composer = useDistributionComposer();
  const tab = searchParams.get("tab") === "agent" ? "agent" : "queue";

  const setTab = (next: "queue" | "agent") => {
    const params = new URLSearchParams(searchParams);
    if (next === "agent") params.set("tab", "agent");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <PageHeader title={t("distribution.title")} description={t("distribution.description")} />
        {!composer.hasAccount ? (
          <div className={cn(APP_CARD_SURFACE, "p-5 text-sm text-muted-foreground")}>
            <p>{t("distribution.accountRequired")}</p>
            <Link to="/signup" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
              {t("distribution.createAccount")}
            </Link>
          </div>
        ) : (
          <>
          <ManualUploadFromLink />
          <div role="tablist" aria-label={t("distribution.title")} className="mb-4 flex gap-2">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "queue"}
              className={cn(
                "min-h-11 rounded-lg px-3 text-sm font-semibold",
                tab === "queue" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
              onClick={() => setTab("queue")}
            >
              {t("distribution.tab.queue")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "agent"}
              className={cn(
                "min-h-11 rounded-lg px-3 text-sm font-semibold",
                tab === "agent" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
              )}
              onClick={() => setTab("agent")}
            >
              {t("distribution.tab.agent")}
            </button>
          </div>
          {tab === "agent" ? (
            <section aria-labelledby="distribution-agent" className={cn(APP_CARD_SURFACE, "min-w-0 p-4 sm:p-5")}>
              <PostingAgentTab />
            </section>
          ) : (
          <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section aria-labelledby="distribution-compose" className={cn(APP_CARD_SURFACE, "min-w-0 p-4 sm:p-5")}>
              <h2 id="distribution-compose" className="mb-4 font-display text-lg font-bold text-foreground">
                {t("distribution.compose.title")}
              </h2>
              <DistributionComposer c={composer} />
            </section>
            <section aria-labelledby="distribution-queue" className={cn(APP_CARD_SURFACE, "min-w-0 p-4 sm:p-5")}>
              <h2 id="distribution-queue" className="mb-4 font-display text-lg font-bold text-foreground">
                {t("distribution.list.title")}
              </h2>
              <DistributionJobList />
            </section>
          </div>
          )}
          </>
        )}
      </div>
    </AppShell>
  );
}

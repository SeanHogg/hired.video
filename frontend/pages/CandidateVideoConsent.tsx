// CandidateVideoConsent — the candidate's answer page for a recruiter's
// candidate-for-job video (/consent/video/:token, linked from the consent
// email). Unauthenticated. Fails closed: a bad, unknown or superseded token
// renders the generic "unavailable" state without saying whether it existed.
// After approving, the same link lets the candidate withdraw consent (it
// keeps working past the link's expiry for as long as the approval stands).

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, ExternalLink, ShieldCheck, Undo2, XCircle } from "lucide-react";
import type { CandidateVideoConsentDecision, PublicCandidateVideoConsent } from "@shared/candidate-video-consent";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUgcSeo } from "@/lib/seo-ugc";
import { candidateConsentService } from "@/lib/services/candidate-consent-service";

type ViewState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; consent: PublicCandidateVideoConsent };

function StatusPanel({ icon: Icon, tone, title, body }: {
  icon: typeof CheckCircle2;
  tone: "success" | "muted";
  title: string;
  body: string;
}) {
  return (
    <div className="text-center space-y-3 py-4" role="status">
      <Icon className={`w-12 h-12 mx-auto ${tone === "success" ? "text-primary" : "text-muted-foreground"}`} />
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function CandidateVideoConsent() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [submitting, setSubmitting] = useState<CandidateVideoConsentDecision | null>(null);
  const [submitFailed, setSubmitFailed] = useState(false);

  // Tokenized links must never be indexed — the "shareToken" adapter pins noindex.
  useUgcSeo("shareToken", {
    title: t("candidateVideoConsent.seo.title"),
    description: t("candidateVideoConsent.seo.description"),
  });

  const load = useCallback(async (): Promise<PublicCandidateVideoConsent | null> => {
    if (!token) return null;
    try {
      return await candidateConsentService.getPublicConsent(token);
    } catch {
      return null;
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    void load().then((consent) => {
      if (alive) setView(consent ? { kind: "ready", consent } : { kind: "unavailable" });
    });
    return () => {
      alive = false;
    };
  }, [load]);

  const respond = async (decision: CandidateVideoConsentDecision) => {
    if (!token) return;
    setSubmitting(decision);
    setSubmitFailed(false);
    try {
      const consent = await candidateConsentService.respond(token, decision);
      setView({ kind: "ready", consent });
    } catch {
      // Expired / already answered: the fresh read shows the real state.
      const consent = await load();
      if (consent) setView({ kind: "ready", consent });
      // Still in the state the action started from → it didn't take.
      const unchanged = decision === "revoke" ? "approved" : "pending";
      if (!consent || consent.status === unchanged) setSubmitFailed(true);
    } finally {
      setSubmitting(null);
    }
  };

  if (view.kind === "loading") {
    return (
      <AppShell variant="public">
        <div className="flex items-center justify-center px-4 py-16">
          <p className="text-sm text-muted-foreground">{t("candidateVideoConsent.loading")}</p>
        </div>
      </AppShell>
    );
  }

  if (view.kind === "unavailable") {
    return (
      <AppShell variant="public">
        <div className="mx-auto w-full max-w-lg px-4 py-16">
          <StatusPanel
            icon={ShieldCheck}
            tone="muted"
            title={t("candidateVideoConsent.unavailable.title")}
            body={t("candidateVideoConsent.unavailable.body")}
          />
        </div>
      </AppShell>
    );
  }

  const { consent } = view;
  const role = consent.jobTitle && consent.companyName
    ? t("candidateVideoConsent.roleAtCompany", { job: consent.jobTitle, company: consent.companyName })
    : consent.jobTitle ?? consent.companyName;

  return (
    <AppShell variant="public" bgClassName="bg-background">
      <main className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
        <Card className="border-border bg-card">
          <CardContent className="space-y-5 p-5 sm:p-6">
            <header className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("candidateVideoConsent.eyebrow")}
              </p>
              <h1 className="text-2xl font-bold leading-tight text-foreground">
                {t("candidateVideoConsent.title", { name: consent.candidateName })}
              </h1>
              <p className="text-sm text-muted-foreground">
                {role
                  ? t("candidateVideoConsent.askedByForRole", { recruiter: consent.recruiterName, role })
                  : t("candidateVideoConsent.askedBy", { recruiter: consent.recruiterName })}
              </p>
            </header>

            {consent.videoUrl ? (
              <div className="space-y-2">
                <video
                  src={consent.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[60vh] rounded-lg bg-muted"
                  aria-label={t("candidateVideoConsent.videoLabel")}
                />
                <a
                  href={consent.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("candidateVideoConsent.openVideo")}
                </a>
              </div>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t("candidateVideoConsent.noVideoYet")}
              </p>
            )}

            {consent.status === "pending" && (
              <div className="space-y-3">
                <p className="text-sm text-foreground">{t("candidateVideoConsent.explainer")}</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="w-full sm:flex-1"
                    disabled={submitting !== null}
                    onClick={() => void respond("approve")}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {submitting === "approve" ? t("candidateVideoConsent.saving") : t("candidateVideoConsent.approve")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full sm:flex-1"
                    disabled={submitting !== null}
                    onClick={() => void respond("decline")}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {submitting === "decline" ? t("candidateVideoConsent.saving") : t("candidateVideoConsent.decline")}
                  </Button>
                </div>
                {submitFailed && (
                  <p className="text-sm text-destructive" role="alert">{t("candidateVideoConsent.submitFailed")}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("candidateVideoConsent.expiresOn", { date: new Date(consent.expiresAt).toLocaleDateString() })}
                </p>
              </div>
            )}

            {consent.status === "approved" && (
              <div className="space-y-3">
                <StatusPanel
                  icon={CheckCircle2}
                  tone="success"
                  title={t("candidateVideoConsent.approved.title")}
                  body={t("candidateVideoConsent.approved.body", { recruiter: consent.recruiterName })}
                />
                <div className="space-y-2 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">{t("candidateVideoConsent.withdraw.explainer")}</p>
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={submitting !== null}
                    onClick={() => void respond("revoke")}
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    {submitting === "revoke" ? t("candidateVideoConsent.saving") : t("candidateVideoConsent.withdraw.action")}
                  </Button>
                  {submitFailed && (
                    <p className="text-sm text-destructive" role="alert">{t("candidateVideoConsent.submitFailed")}</p>
                  )}
                </div>
              </div>
            )}
            {consent.status === "revoked" && (
              <StatusPanel
                icon={Undo2}
                tone="muted"
                title={t("candidateVideoConsent.withdrawn.title")}
                body={t("candidateVideoConsent.withdrawn.body", { recruiter: consent.recruiterName })}
              />
            )}
            {consent.status === "declined" && (
              <StatusPanel
                icon={XCircle}
                tone="muted"
                title={t("candidateVideoConsent.declined.title")}
                body={t("candidateVideoConsent.declined.body")}
              />
            )}
            {consent.status === "expired" && (
              <StatusPanel
                icon={Clock}
                tone="muted"
                title={t("candidateVideoConsent.expired.title")}
                body={t("candidateVideoConsent.expired.body", { recruiter: consent.recruiterName })}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

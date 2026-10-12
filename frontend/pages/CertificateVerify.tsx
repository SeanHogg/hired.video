/**
 * CertificateVerify — public verification + display of a hired.video
 * learning certificate.
 *
 * Route: `/verify/:certNumber`
 *
 * The recipient lands here after passing a course (CourseLearner's
 * "View certificate" CTA). Recruiters / hiring managers / LinkedIn
 * viewers also land here from a shared cert URL. Fully public — the
 * cert number is the only auth token, mirroring the verify
 * convention used by Credly / Accredible / Coursera.
 *
 * The HMAC signature itself stays server-side (the
 * `/api/verify/:certNumber` endpoint replays validation and returns
 * a `valid` boolean + the canonical payload). This page renders the
 * payload + a "Verified" badge — no client-side signature math.
 *
 * Print-friendly: the layout uses `print:` Tailwind variants so users
 * can hit Ctrl-P and get a clean one-page certificate.
 */

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Award, Copy, Loader2, Printer, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/AppShell";
import { useBreadcrumbs, useSEO } from "@/lib/seo";
import { useToast } from "@/hooks/use-toast";
import { verifyCertificate, type VerifyResult } from "@/lib/courses/courses-api";
import { formatContentDate } from "@/lib/content/reading-meta";
import { CONTENT_CARD } from "@/components/content/content-ui";
import { cn } from "@/lib/utils";

const REASON_KEY: Record<string, string> = {
  tampered: "certificate.reason.tampered",
  revoked: "certificate.reason.revoked",
  expired: "certificate.reason.expired",
};

export default function CertificateVerify() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { certNumber } = useParams<{ certNumber: string }>();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useSEO("/verify", {
    title: result?.valid && result.courseTitle
      ? t("certificate.seoTitleValid", {
          name: result.recipientName ?? t("certificate.breadcrumb"),
          course: result.courseTitle,
        })
      : t("certificate.seoTitle"),
    description: t("certificate.seoDescription"),
  });
  useBreadcrumbs([{ name: t("certificate.breadcrumb"), url: `/verify/${certNumber ?? ""}` }]);

  useEffect(() => {
    if (!certNumber) return;
    let cancelled = false;
    setLoading(true);
    verifyCertificate(certNumber)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult({ valid: false, reason: "not_found" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [certNumber]);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      toast({ title: t("certificate.linkCopied") });
    } catch {
      /* clipboard unavailable — nothing to do */
    }
  };

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-[50vh] items-center justify-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t("certificate.verifying")}
        </div>
      </AppShell>
    );
  }

  // Invalid / tampered / revoked / expired — all flow through the same
  // single error surface so the consumer knows the cert can't be trusted.
  if (!result || !result.valid) {
    const reasonKey = (result?.reason && REASON_KEY[result.reason]) || "certificate.reason.notFound";
    return (
      <AppShell bgClassName="bg-background">
        <main className="mx-auto w-full max-w-2xl px-6 py-16">
          <div className={cn(CONTENT_CARD, "flex flex-col items-center gap-4 p-8 text-center")}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldX className="h-7 w-7" aria-hidden="true" />
            </span>
            <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold tracking-[-0.03em] text-foreground">
              {t("certificate.notVerified")}
            </h1>
            <p className="text-muted-foreground">{t(reasonKey)}</p>
            <p className="font-mono text-xs text-muted-foreground">{t("certificate.certLabel", { number: certNumber })}</p>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link to="/tools?tab=learning">{t("certificate.browseCourses")}</Link>
            </Button>
          </div>
        </main>
      </AppShell>
    );
  }

  const issuedDate = formatContentDate(result.issuedAt, i18n.language, "long");
  const expiresDate = formatContentDate(result.expiresAt, i18n.language, "long");

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto w-full max-w-3xl px-6 py-10 print:p-0">
        <article className={cn(CONTENT_CARD, "overflow-hidden print:border-0")}>
          <div className="h-1.5 bg-primary" aria-hidden="true" />
          <div className="flex flex-col items-center gap-6 p-8 text-center md:p-12">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
              <Award className="h-8 w-8" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t("certificate.ofCompletion")}
              </p>
              <p className="text-sm text-muted-foreground">{t("certificate.certifies")}</p>
              <h1 className="font-display text-[clamp(32px,4.6vw,52px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
                {result.recipientName ?? t("certificate.recipient")}
              </h1>
              <p className="text-sm text-muted-foreground">{t("certificate.completed")}</p>
              <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {result.courseTitle ?? t("certificate.theCourse")}
              </h2>
            </div>

            {result.finalScorePct != null && (
              <p className="text-sm text-muted-foreground">
                {t("certificate.finalScore")}:{" "}
                <span className="font-mono font-semibold tabular-nums text-brand-green-text">
                  {Math.round(result.finalScorePct)}%
                </span>
              </p>
            )}

            <dl className="grid w-full grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <div>
                <dt className="font-mono text-[11px] uppercase text-muted-foreground">{t("certificate.issued")}</dt>
                <dd className="mt-1 font-medium text-foreground">{issuedDate ?? "—"}</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase text-muted-foreground">{t("certificate.issuedBy")}</dt>
                <dd className="mt-1 font-medium text-foreground">{result.issuer ?? "hired.video"}</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase text-muted-foreground">
                  {expiresDate ? t("certificate.expires") : t("certificate.validity")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">{expiresDate ?? t("certificate.noExpiry")}</dd>
              </div>
            </dl>

            <span className="inline-flex items-center gap-2 rounded-full bg-brand-green/15 px-3 py-1.5 text-xs font-semibold text-brand-green-text">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {t("certificate.verified")}
            </span>

            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {t("certificate.certLabel", { number: result.certNumber })}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 print:hidden">
              <Button onClick={() => window.print()} variant="outline" className="min-h-[44px]">
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("certificate.print")}
              </Button>
              <Button onClick={copyLink} variant="outline" className="min-h-[44px]">
                <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t("certificate.copyLink")}
              </Button>
            </div>
          </div>
          <div className="h-1.5 bg-primary" aria-hidden="true" />
        </article>
      </main>
    </AppShell>
  );
}

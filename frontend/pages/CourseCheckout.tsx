/**
 * CourseCheckout — paid-course enrolment landing page (#1400 build-strategy
 * "Course payment / cart wiring").
 *
 * Route: `/checkout/course/:courseId`
 *
 * Flow:
 *   1. POST /api/course-checkout/start { courseId } → mints a pending row.
 *   2. The page renders price + creator-cut + platform-fee split + a
 *      "Pay $X" button that triggers the existing payment provider.
 *   3. On payment success, the provider's success handler POSTs
 *      /api/course-checkout/:id/confirm-payment { providerPaymentId }
 *      which flips the row to `paid` and creates the enrolment.
 *   4. We navigate to `/learn/:enrollmentId` once the enrolment lands.
 *
 * All network calls go through `courseCheckoutService`; the existing
 * /api/payment endpoint owns provider-specific UI (Stripe Elements /
 * Helcim drop-in). When that endpoint isn't configured for a deployment,
 * the page surfaces a clear status.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Loader2, GraduationCap, CreditCard, ShieldCheck, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { usePageChrome } from "@/lib/seo";
import { courseService, type Course } from "@/lib/services/course-service";
import { courseCheckoutService, type CourseCheckoutRow } from "@/lib/services/course-checkout-service";
import { CONTENT_CARD, EYEBROW_CHIP } from "@/components/content/content-ui";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { cn } from "@/lib/utils";

export default function CourseCheckout() {
  usePageChrome();
  const { t, i18n } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [checkout, setCheckout] = useState<CourseCheckoutRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const row = await courseCheckoutService.start(courseId);
        if (cancelled) return;
        // Course-detail fetch for the UI side.
        const detail = await courseService.getDetails(row.courseId).catch(() => null);
        if (cancelled) return;
        setCheckout(row);
        if (detail) setCourse(detail.course);
        if (row.status === "paid" && row.enrollmentId) {
          navigate(`/learn/${row.enrollmentId}`, { replace: true });
        }
      } catch (e: unknown) {
        const code = (e as { code?: string } | null)?.code;
        if (code === "ALREADY_ENROLLED") {
          // Happy path: user already paid → just route them in.
          const enrollments = await courseService.listMyEnrollments().catch(() => []);
          const existing = enrollments.find((r) => r.courseId === courseId);
          if (existing) {
            navigate(`/learn/${existing.id}`, { replace: true });
            return;
          }
        }
        // "" = no server message; rendered as the generic copy below.
        if (!cancelled) setError(e instanceof Error ? e.message : "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [courseId, isAuthenticated, navigate]);

  const handlePay = async () => {
    if (!checkout) return;
    setPaying(true);
    try {
      const enrollmentId = await courseCheckoutService.payAndConfirm(checkout);
      toast({ title: t("courseCheckout.paySuccess"), description: t("courseCheckout.paySuccessBody") });
      navigate(`/learn/${enrollmentId}`, { replace: true });
    } catch (e: unknown) {
      toast({
        title: t("courseCheckout.payFailed"),
        description: e instanceof Error ? e.message : t("actions.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setPaying(false);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=/checkout/course/${courseId ?? ""}`} replace />;
  }
  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t("courseCheckout.starting")}
        </div>
      </AppShell>
    );
  }
  if (error !== null || !checkout) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="mx-auto w-full max-w-md px-6 py-16">
          <div className={cn(CONTENT_CARD, "flex flex-col items-center gap-3 p-8 text-center")}>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {t("courseCheckout.unavailable")}
            </h1>
            <p className="text-sm text-muted-foreground">{error || t("courseCheckout.startFailed")}</p>
            <Button variant="outline" className="min-h-[44px]" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t("actions.back")}
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  const money = (cents: number) =>
    new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto w-full max-w-xl px-6 pb-[72px] pt-10">
        <div className={cn(CONTENT_CARD, "flex flex-col gap-5 p-6 sm:p-8")}>
          <span className={EYEBROW_CHIP}>
            <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" /> {t("courseCheckout.eyebrow")}
          </span>
          <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold leading-tight tracking-[-0.03em] text-foreground">
            {course?.title ?? t("labels.courseLearner.course")}
          </h1>
          {course?.summary && <p className="text-muted-foreground">{course.summary}</p>}

          <dl className="divide-y divide-border rounded-2xl border border-border">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm font-semibold text-foreground">{t("courseCheckout.price")}</dt>
              <dd className="font-mono text-base font-semibold tabular-nums text-foreground">{money(checkout.totalCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("courseCheckout.creatorCut")}</dt>
              <dd className="font-mono text-sm tabular-nums text-muted-foreground">{money(checkout.creatorCutCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("courseCheckout.platformFee")}</dt>
              <dd className="font-mono text-sm tabular-nums text-muted-foreground">{money(checkout.platformFeeCents)}</dd>
            </div>
          </dl>

          <button type="button" className={cn(HERO_CTA_PRIMARY, "w-full")} onClick={handlePay} disabled={paying}>
            {paying ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <CreditCard className="h-4 w-4" aria-hidden="true" />
            )}
            {t("courseCheckout.pay", { amount: money(checkout.totalCents) })}
          </button>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("courseCheckout.pciNote")}
          </p>
        </div>
      </main>
    </AppShell>
  );
}

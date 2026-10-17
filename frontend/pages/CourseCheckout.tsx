/**
 * CourseCheckout — paid-course enrolment landing page (#1400 build-strategy
 * "Course payment / cart wiring").
 *
 * Route: `/checkout/course/:courseId`
 *
 * Flow (the one checkout surface, shared/checkout.ts):
 *   1. POST /api/checkout { kind: "course", courseId } → mints (or resumes)
 *      a pending checkout with the server-side price split.
 *   2. The page renders price + creator-cut + platform-fee split + a
 *      "Pay $X" button.
 *   3. useCheckoutPayment opens the payment widget for exactly the price
 *      (POST /api/checkout/:id/pay), then POST /api/checkout/:id/confirm
 *      with the widget's transaction id — the server re-reads it from the
 *      provider before flipping the checkout to `paid` and enrolling.
 *   4. We navigate to `/learn/:enrollmentId` once the enrolment lands.
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
import { checkoutService } from "@/lib/services/checkout-service";
import { useCheckoutPayment } from "@/hooks/use-checkout-payment";
import { apiServerErrorCode } from "@/lib/api-error-code";
import type { CheckoutConfirmDTO, CheckoutDTO } from "@shared/checkout";
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
  const [checkout, setCheckout] = useState<CheckoutDTO<"course"> | null>(null);
  const { pay } = useCheckoutPayment();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId || !isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const row = await checkoutService.start<"course">({ kind: "course", courseId });
        if (cancelled) return;
        // Course-detail fetch for the UI side.
        const detail = await courseService.getDetails(row.details.courseId).catch(() => null);
        if (cancelled) return;
        setCheckout(row);
        if (detail) setCourse(detail.course);
        if (row.status === "paid" && row.details.enrollmentId) {
          navigate(`/learn/${row.details.enrollmentId}`, { replace: true });
        }
      } catch (e: unknown) {
        if (apiServerErrorCode(e) === "ALREADY_ENROLLED") {
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
    const result = await pay<CheckoutConfirmDTO<"course">>(checkout.id);
    setPaying(false);
    const enrollmentId = result.status === "paid" ? result.confirmation.outcome.enrollmentId : null;
    if (enrollmentId) {
      toast({ title: t("courseCheckout.paySuccess"), description: t("courseCheckout.paySuccessBody") });
      navigate(`/learn/${enrollmentId}`, { replace: true });
    } else if (result.status === "paid" || result.status === "verifying") {
      toast({ title: t("courseCheckout.verifying"), description: t("courseCheckout.verifyingBody") });
    } else if (result.status === "error") {
      toast({
        title: t("courseCheckout.payFailed"),
        description: result.error instanceof Error && result.error.message ? result.error.message : t("actions.tryAgain"),
        variant: "destructive",
      });
    }
    // cancelled: the widget closed; the checkout stays pending for a retry.
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
              <dd className="font-mono text-sm tabular-nums text-muted-foreground">{money(checkout.details.creatorCutCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-sm text-muted-foreground">{t("courseCheckout.platformFee")}</dt>
              <dd className="font-mono text-sm tabular-nums text-muted-foreground">{money(checkout.details.platformFeeCents)}</dd>
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

/**
 * /learn/dashboard — the learner's consolidated learning home (#2068 GAP-5).
 *
 * One round-trip (`GET /api/learning/dashboard`) hydrates enrollments +
 * progress + completed + certificates + points/streak/badges + assigned work;
 * the XP leaderboard (#2068 GAP-4) renders alongside. Authed learner surface.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Award, BookOpen, Flame, GraduationCap, Loader2, Sparkles, Trophy } from "lucide-react";
import { getLearnerDashboard, type LearnerDashboard } from "@/lib/courses/courses-api";
import XpLeaderboardPanel from "@/components/learning/XpLeaderboardPanel";
import { cn } from "@/lib/utils";

export default function LearnerDashboardPage() {
  const { t } = useTranslation();
  useSEO("/learn/dashboard");
  useBreadcrumbs([{ name: t("learn.dashboard.breadcrumb"), url: "/learn/dashboard" }]);

  const [data, setData] = useState<LearnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLearnerDashboard()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const browseCourses = (
    <Button asChild className="min-h-[44px]">
      <Link to="/search?category=courses">{t("learn.dashboard.browseCourses")}</Link>
    </Button>
  );

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto w-full max-w-[1200px] px-6 pb-[72px] pt-8">
        <PageHeader
          title={t("learn.dashboard.title")}
          description={t("learn.dashboard.subtitle")}
          actions={browseCourses}
        />

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground" role="status">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : failed || !data ? (
          <p className="py-8 text-sm text-destructive" role="alert">{t("learn.dashboard.loadError")}</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              {/* Stats */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(130px,100%),1fr))] gap-3">
                <Stat icon={<BookOpen className="h-3.5 w-3.5" />} label={t("learn.dashboard.statCourses")} value={data.stats.activeCourses} />
                <Stat icon={<GraduationCap className="h-3.5 w-3.5" />} label={t("learn.dashboard.statCompleted")} value={data.stats.completedCourses} />
                <Stat icon={<Award className="h-3.5 w-3.5" />} label={t("learn.dashboard.statCerts")} value={data.stats.certificates} />
                <Stat icon={<Trophy className="h-3.5 w-3.5" />} label={t("learn.dashboard.statPoints")} value={data.stats.points} positive />
                <Stat icon={<Flame className="h-3.5 w-3.5" />} label={t("learn.dashboard.statStreak")} value={data.stats.streak} />
              </div>

              {/* Continue learning */}
              <Section title={t("learn.dashboard.continueLearning")}>
                {data.continueLearning.length === 0 ? (
                  <EmptyRow />
                ) : (
                  data.continueLearning.map((c) => (
                    <CourseRow
                      key={c.enrollmentId}
                      title={c.title}
                      pct={c.pct}
                      href={`/learn/${c.enrollmentId}`}
                      cta={t("learn.dashboard.resume")}
                    />
                  ))
                )}
              </Section>

              {/* Assigned */}
              {data.assigned.length > 0 && (
                <Section title={t("learn.dashboard.assigned")}>
                  {data.assigned.map((a) => (
                    <li key={a.assignmentId} className="flex items-center gap-3 py-3">
                      <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{a.title}</div>
                        <div className="truncate font-mono text-[11px] uppercase text-muted-foreground">
                          {a.cohortName}
                          {a.dueAt ? ` · ${t("learn.dashboard.due", { date: new Date(a.dueAt).toLocaleDateString() })}` : ""}
                        </div>
                      </div>
                      {a.enrollmentId && (
                        <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                          <Link to={`/learn/${a.enrollmentId}`}>{t("learn.dashboard.start")}</Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </Section>
              )}

              {/* Completed */}
              {data.completed.length > 0 && (
                <Section title={t("learn.dashboard.completed")}>
                  {data.completed.map((c) => (
                    <CourseRow
                      key={c.enrollmentId}
                      title={c.title}
                      pct={100}
                      href={`/courses/${c.slug}`}
                      cta={t("learn.dashboard.view")}
                    />
                  ))}
                </Section>
              )}

              {/* Certificates */}
              {data.certificates.length > 0 && (
                <Section title={t("learn.dashboard.certificates")}>
                  {data.certificates.map((cert) => (
                    <li key={cert.id} className="flex items-center gap-3 py-3">
                      <Award className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                      <span className="flex-1 truncate text-sm font-medium text-foreground">
                        {cert.courseTitle ?? cert.certNumber}
                      </span>
                      <Button asChild size="sm" variant="ghost" className="min-h-[44px]">
                        <Link to={`/verify/${cert.certNumber}`}>{t("learn.dashboard.viewCertificate")}</Link>
                      </Button>
                    </li>
                  ))}
                </Section>
              )}

              {data.continueLearning.length === 0 &&
                data.completed.length === 0 &&
                data.assigned.length === 0 && (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground">{t("learn.dashboard.empty")}</p>
                    {browseCourses}
                  </div>
                )}
            </div>

            <div className="flex min-w-0 flex-col gap-6">
              <XpLeaderboardPanel scope="global" limit={10} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Stat({
  icon,
  label,
  value,
  positive = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div
        className={cn(
          "font-display text-[28px] font-bold leading-none tracking-tight tabular-nums",
          positive ? "text-brand-green-text" : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-border bg-card">
      <h2 className="border-b border-border px-5 py-4 text-lg font-bold tracking-tight text-foreground">{title}</h2>
      <ul className="divide-y divide-border px-5">{children}</ul>
    </section>
  );
}

function CourseRow({ title, pct, href, cta }: { title: string; pct: number; href: string; cta: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="min-h-[44px]">
        <Link to={href}>{cta}</Link>
      </Button>
    </li>
  );
}

function EmptyRow() {
  const { t } = useTranslation();
  return <li className="py-3 text-sm text-muted-foreground">{t("learn.dashboard.empty")}</li>;
}

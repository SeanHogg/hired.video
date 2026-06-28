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
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Award, BookOpen, Flame, GraduationCap, Loader2, Sparkles, Trophy } from "lucide-react";
import { getLearnerDashboard, type LearnerDashboard } from "@/lib/courses/courses-api";
import XpLeaderboardPanel from "@/components/learning/XpLeaderboardPanel";

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

  return (
    <AppShell>
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">{t("learn.dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("learn.dashboard.subtitle")}</p>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : failed || !data ? (
          <div className="text-sm text-destructive py-8">{t("learn.dashboard.loadError")}</div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat icon={<BookOpen className="w-4 h-4" />} label={t("learn.dashboard.statCourses")} value={data.stats.activeCourses} />
                <Stat icon={<GraduationCap className="w-4 h-4" />} label={t("learn.dashboard.statCompleted")} value={data.stats.completedCourses} />
                <Stat icon={<Award className="w-4 h-4" />} label={t("learn.dashboard.statCerts")} value={data.stats.certificates} />
                <Stat icon={<Trophy className="w-4 h-4" />} label={t("learn.dashboard.statPoints")} value={data.stats.points} />
                <Stat icon={<Flame className="w-4 h-4" />} label={t("learn.dashboard.statStreak")} value={data.stats.streak} />
              </div>

              {/* Continue learning */}
              <Section title={t("learn.dashboard.continueLearning")}>
                {data.continueLearning.length === 0 ? (
                  <EmptyRow />
                ) : (
                  data.continueLearning.map((c) => (
                    <CourseRow key={c.enrollmentId} title={c.title} pct={c.pct}
                      href={`/learn/${c.enrollmentId}`} cta={t("learn.dashboard.resume")} />
                  ))
                )}
              </Section>

              {/* Assigned */}
              {data.assigned.length > 0 && (
                <Section title={t("learn.dashboard.assigned")}>
                  {data.assigned.map((a) => (
                    <div key={a.assignmentId} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <Sparkles className="w-4 h-4 text-violet-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {a.cohortName}
                          {a.dueAt ? ` · ${t("learn.dashboard.due", { date: new Date(a.dueAt).toLocaleDateString() })}` : ""}
                        </div>
                      </div>
                      {a.enrollmentId && (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/learn/${a.enrollmentId}`}>{t("learn.dashboard.start")}</Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </Section>
              )}

              {/* Completed */}
              {data.completed.length > 0 && (
                <Section title={t("learn.dashboard.completed")}>
                  {data.completed.map((c) => (
                    <CourseRow key={c.enrollmentId} title={c.title} pct={100}
                      href={`/courses/${c.slug}`} cta={t("learn.dashboard.view")} />
                  ))}
                </Section>
              )}

              {/* Certificates */}
              {data.certificates.length > 0 && (
                <Section title={t("learn.dashboard.certificates")}>
                  {data.certificates.map((cert) => (
                    <div key={cert.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                      <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="flex-1 truncate text-sm">{cert.courseTitle ?? cert.certNumber}</span>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/verify/${cert.certNumber}`}>{t("learn.dashboard.viewCertificate")}</Link>
                      </Button>
                    </div>
                  ))}
                </Section>
              )}

              {data.continueLearning.length === 0 &&
                data.completed.length === 0 &&
                data.assigned.length === 0 && (
                  <div className="text-center py-10 space-y-3">
                    <p className="text-sm text-muted-foreground">{t("learn.dashboard.empty")}</p>
                    <Button asChild>
                      <Link to="/search?category=courses">{t("learn.dashboard.browseCourses")}</Link>
                    </Button>
                  </div>
                )}
            </div>

            <div className="space-y-6">
              <XpLeaderboardPanel scope="global" limit={10} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">{icon}{label}</div>
      <div className="text-xl font-bold mt-1 tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border rounded-lg bg-card">
      <h2 className="font-semibold text-sm px-4 py-3 border-b">{title}</h2>
      <div className="px-4 py-1">{children}</div>
    </section>
  );
}

function CourseRow({ title, pct, href, cta }: { title: string; pct: number; href: string; cta: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to={href}>{cta}</Link>
      </Button>
    </div>
  );
}

function EmptyRow() {
  const { t } = useTranslation();
  return <div className="text-sm text-muted-foreground py-3">{t("learn.dashboard.empty")}</div>;
}

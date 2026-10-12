// /pivot-explorer?to=<sector> — drilldown on one AI-resilient sector:
// reality check, transferable skills (highlighting the user's matches),
// licensing, order of operations and the recommended resume template.

import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { ToolTitleBlock } from "@/components/tools/ToolTitleBlock";
import MonoChip from "@/components/templates/MonoChip";
import { cn } from "@/lib/utils";
import { sectorMeta, type Sector } from "@shared/sectors";
import { sectorTemplateRec } from "@shared/sector-templates";
import { RESILIENCE_LABEL_KEYS, scoreSector } from "./pivot-scoring";

const linkClass = "font-semibold text-primary underline-offset-4 hover:underline";

export function PivotDrilldown({ sector, userSkills }: { sector: Sector; userSkills: string[] }) {
  const { t } = useTranslation();
  const meta = sectorMeta(sector);
  const rec = sectorTemplateRec(sector);
  const scored = scoreSector(meta, userSkills);

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 pt-8 sm:px-6">
        <Link
          to="/pivot-explorer"
          className="inline-flex min-h-[44px] w-fit items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("pivotExplorer.drilldown.backAll")}
        </Link>

        <ToolTitleBlock
          icon={<Compass />}
          chips={
            <MonoChip>
              {t("pivotExplorer.resilienceChip", { level: t(RESILIENCE_LABEL_KEYS[meta.aiResilience]) })}
            </MonoChip>
          }
          title={t("pivotExplorer.drilldown.heading", { sector: meta.label })}
          description={meta.tagline}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("pivotExplorer.drilldown.realityCheck")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="leading-relaxed text-muted-foreground">{meta.aiResilienceNotes}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("pivotExplorer.drilldown.skillsFromTech")}</CardTitle>
          </CardHeader>
          <CardContent>
            {meta.transferableFromTech.length === 0 ? (
              <p className="leading-relaxed text-muted-foreground">
                {t("pivotExplorer.drilldown.noTransferable")}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {meta.transferableFromTech.map((s) => {
                  const isMatch = scored.matchedSkills.includes(s);
                  return (
                    <li
                      key={s}
                      className={cn("flex flex-wrap items-center gap-2 py-2.5", isMatch && "font-medium")}
                    >
                      <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">{s}</span>
                      {isMatch && (
                        <MonoChip tone="free" className="gap-1">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          {t("pivotExplorer.drilldown.yourSkill")}
                        </MonoChip>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {meta.requiresLicense && meta.licensingNotes && (
          <Card>
            <CardHeader>
              <CardTitle>{t("pivotExplorer.drilldown.acquire")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="leading-relaxed text-muted-foreground">{meta.licensingNotes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t("pivotExplorer.drilldown.orderOfOps")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3">
              {[
                t("pivotExplorer.drilldown.step1"),
                t("pivotExplorer.drilldown.step2", { roles: meta.exampleRoles.slice(0, 3).join(", ") }),
                t("pivotExplorer.drilldown.step3"),
                <Trans
                  key="step4"
                  i18nKey="pivotExplorer.drilldown.step4"
                  components={{
                    link: <Link to={`/articles?sector=${meta.slug}&audience=pivot`} className={linkClass} />,
                  }}
                />,
                <Trans
                  key="step5"
                  i18nKey="pivotExplorer.drilldown.step5"
                  values={{ sector: meta.label }}
                  components={{ link: <Link to={`/jobs?sector=${meta.slug}`} className={linkClass} /> }}
                />,
              ].map((step, idx) => (
                <li key={idx} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent font-mono text-sm font-semibold text-primary"
                  >
                    {idx + 1}
                  </span>
                  <span className="pt-1 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader>
            <MonoChip className="w-fit">{t("pivotExplorer.drilldown.recommendedChip")}</MonoChip>
            <CardTitle>{rec.displayName}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="leading-relaxed text-muted-foreground">{rec.rationale}</p>
            <Button asChild size="lg" className="w-full gap-2 sm:w-fit">
              <Link to={`/resume-templates?sector=${meta.slug}`}>
                {t("pivotExplorer.drilldown.openGallery")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

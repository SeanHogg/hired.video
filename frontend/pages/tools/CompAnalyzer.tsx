/**
 * /tools/comp-analyzer — executive total-comp breakdown (#1676). Thin
 * client form over shared/comp-analyzer.ts (pure, unit-tested). Annualizes
 * base + bonus + equity + sign-on so execs compare offers on total comp,
 * not base salary.
 */
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useSEO, useDefaultBreadcrumbs } from "@/lib/seo";
import { analyzeComp, basePercent, type CompInput } from "@shared/comp-analyzer";

const fmt = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function numField(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function CompAnalyzer(): JSX.Element {
  const location = useLocation();
  const { t } = useTranslation();
  useDefaultBreadcrumbs();
  useSEO(location.pathname, {
    title: t("tools.compAnalyzer.seoTitle"),
    description: t("tools.compAnalyzer.seoDescription"),
    ogTitle: t("tools.compAnalyzer.ogTitle"),
    ogDescription: t("tools.compAnalyzer.ogDescription"),
  });

  const [input, setInput] = useState<CompInput>({
    baseSalary: 300000,
    targetBonus: 150000,
    equityGrantValue: 1200000,
    vestingYears: 4,
    signOnBonus: 100000,
    benefitsValue: 25000,
  });

  const set = (k: keyof CompInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInput((prev) => ({ ...prev, [k]: numField(e.target.value) }));

  const result = useMemo(() => analyzeComp(input), [input]);
  const baseShare = basePercent(result);

  const rows: Array<{ label: string; value: number; share: number }> = [
    { label: t("tools.compAnalyzer.rowBase"), value: result.baseSalary, share: result.composition.base },
    { label: t("tools.compAnalyzer.rowBonus"), value: result.targetBonus, share: result.composition.bonus },
    { label: t("tools.compAnalyzer.rowEquity"), value: result.annualEquity, share: result.composition.equity },
    { label: t("tools.compAnalyzer.rowSignOn"), value: result.annualizedSignOn, share: result.composition.signOn },
    { label: t("tools.compAnalyzer.rowBenefits"), value: result.benefitsValue, share: result.composition.benefits },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{t("tools.compAnalyzer.heading")}</h1>
        <p className="text-muted-foreground mb-8">{t("tools.compAnalyzer.intro")}</p>

        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardContent className="p-6 space-y-4">
              <Field label={t("tools.compAnalyzer.fieldBase")} value={input.baseSalary} onChange={set("baseSalary")} />
              <Field label={t("tools.compAnalyzer.fieldBonus")} value={input.targetBonus} onChange={set("targetBonus")} />
              <Field label={t("tools.compAnalyzer.fieldEquity")} value={input.equityGrantValue} onChange={set("equityGrantValue")} />
              <Field label={t("tools.compAnalyzer.fieldVesting")} value={input.vestingYears} onChange={set("vestingYears")} step />
              <Field label={t("tools.compAnalyzer.fieldSignOn")} value={input.signOnBonus} onChange={set("signOnBonus")} />
              <Field label={t("tools.compAnalyzer.fieldBenefits")} value={input.benefitsValue} onChange={set("benefitsValue")} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">{t("tools.compAnalyzer.annualizedTotal")}</p>
                <p className="text-3xl font-bold">{fmt(result.annualizedTotal)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("tools.compAnalyzer.yearOne")} <span className="font-medium text-foreground">{fmt(result.yearOneTotal)}</span>
                </p>
              </div>
              <Badge variant={baseShare < 50 ? "secondary" : "outline"} className="mb-4">
                {baseShare < 50
                  ? t("tools.compAnalyzer.baseShareHeavy", { percent: baseShare })
                  : t("tools.compAnalyzer.baseShare", { percent: baseShare })}
              </Badge>
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.label}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-medium">{fmt(r.value)} · {Math.round(r.share * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded bg-muted">
                      <div className="h-1.5 rounded bg-brand-purple" style={{ width: `${Math.round(r.share * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          {t("tools.compAnalyzer.disclaimer")}
        </p>
      </section>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number | undefined;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  step?: boolean;
}): JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-sm">{label}</Label>
      <Input
        inputMode="numeric"
        value={value ?? 0}
        onChange={onChange}
        step={step ? 1 : undefined}
      />
    </div>
  );
}

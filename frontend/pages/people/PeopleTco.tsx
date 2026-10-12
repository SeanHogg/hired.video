import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tcoApi, type TcoAssumptions, type TcoBreakdown } from "@/lib/people-ops/api";
import { DEFAULT_TCO_ASSUMPTIONS } from "@shared/people-ops";

type PctKey = "payrollTaxesPct" | "benefitsPct" | "perksPct" | "overheadPct";
type CentsKey = "cashOnHandCents" | "monthlyBurnCents";

const PCT_FIELDS: PctKey[] = ["payrollTaxesPct", "benefitsPct", "perksPct", "overheadPct"];
const RUNWAY_FIELDS: CentsKey[] = ["cashOnHandCents", "monthlyBurnCents"];

const BREAKDOWN_ROWS: (keyof TcoBreakdown)[] = [
  "annualSalary", "payrollTaxes", "benefits", "perks", "overhead", "recruiting", "training",
];

const EMPTY: TcoAssumptions = { ...DEFAULT_TCO_ASSUMPTIONS, cashOnHandCents: null, monthlyBurnCents: null };

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const dollarsToCents = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v) * 100)));
const centsToDollars = (v: number | null): string => (v == null ? "" : String(v / 100));

/** Months of runway at current burn, or null when it isn't defined. */
function currentRunwayMonths(a: TcoAssumptions): number | null {
  if (a.cashOnHandCents == null || !a.monthlyBurnCents) return null;
  return a.cashOnHandCents / a.monthlyBurnCents;
}

export default function PeopleTco() {
  const { t } = useTranslation();
  useSEO("/people/tco");
  useBreadcrumbs([
    { name: t("peopleTco.breadcrumb.peopleOps"), url: "/people-ops" },
    { name: t("peopleTco.title"), url: "/people/tco" },
  ]);
  const [assumptions, setAssumptions] = useState<TcoAssumptions>(EMPTY);
  const [salary, setSalary] = useState("120000");
  const [result, setResult] = useState<TcoBreakdown | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    tcoApi.assumptions().then((a) => setAssumptions({ ...EMPTY, ...a })).catch((e) => {
      if (/paid|upgrade/i.test(e instanceof Error ? e.message : "")) setUpgrade(true);
    });
  }, []);

  const saveAssumptions = async () => {
    const next = await tcoApi.saveAssumptions(assumptions);
    setAssumptions({ ...EMPTY, ...next });
  };
  const calculate = async () => setResult(await tcoApi.calculate(Number(salary)));
  const runway = currentRunwayMonths(assumptions);

  if (upgrade) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="mx-auto max-w-2xl space-y-4 px-4 py-16 text-center sm:px-6">
          <h1 className="text-3xl font-bold">{t("peopleTco.upgrade.title")}</h1>
          <Link to="/people-operations" className="text-primary underline">{t("peopleTco.upgrade.link")}</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-3xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <Link to="/people-ops" className="text-sm text-muted-foreground hover:underline">← {t("peopleTco.breadcrumb.peopleOps")}</Link>
          <h1 className="text-3xl font-bold tracking-tight">{t("peopleTco.title")}</h1>
          <p className="text-muted-foreground">{t("peopleTco.subtitle")}</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("peopleTco.assumptions.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(160px,100%),1fr))] gap-3">
              {PCT_FIELDS.map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`tco-${key}`}>{t(`peopleTco.assumptions.${key}`)}</Label>
                  <Input
                    id={`tco-${key}`}
                    type="number" step="0.01" min="0"
                    value={assumptions[key]}
                    onChange={(e) => setAssumptions({ ...assumptions, [key]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">{t("peopleTco.runway.title")}</p>
              <p className="text-sm text-muted-foreground">{t("peopleTco.runway.description")}</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-3">
                {RUNWAY_FIELDS.map((key) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`tco-${key}`}>{t(`peopleTco.runway.${key}`)}</Label>
                    <Input
                      id={`tco-${key}`}
                      type="number" step="1" min="0"
                      placeholder={t("peopleTco.runway.placeholder")}
                      value={centsToDollars(assumptions[key])}
                      onChange={(e) => setAssumptions({ ...assumptions, [key]: dollarsToCents(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground" role="status">
                {runway == null
                  ? t("peopleTco.runway.unknown")
                  : t("peopleTco.runway.current", { months: runway.toFixed(1) })}
              </p>
            </div>

            <Button variant="outline" className="min-h-[44px]" onClick={saveAssumptions}>{t("peopleTco.assumptions.save")}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{t("peopleTco.calculator.title")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label htmlFor="tco-salary">{t("peopleTco.calculator.salary")}</Label>
                <Input id="tco-salary" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
              </div>
              <Button className="min-h-[44px]" onClick={calculate}>{t("peopleTco.calculator.calculate")}</Button>
            </div>
            {result && (
              <div className="space-y-1 pt-2 text-sm">
                {BREAKDOWN_ROWS.map((key) => (
                  <div key={key} className="flex justify-between border-b border-border py-1">
                    <span className="text-muted-foreground">{t(`peopleTco.breakdown.${key}`)}</span>
                    <span>{usd(result[key])}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-semibold">
                  <span>{t("peopleTco.breakdown.totalLoadedCost")}</span><span>{usd(result.totalLoadedCost)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("peopleTco.breakdown.monthlyLoadedCost")}</span><span>{usd(result.monthlyLoadedCost)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

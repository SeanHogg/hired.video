/**
 * /tools/comp-analyzer — executive total-comp breakdown (#1676). Thin
 * client form over shared/comp-analyzer.ts (pure, unit-tested). Annualizes
 * base + bonus + equity + sign-on so execs compare offers on total comp,
 * not base salary.
 */
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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
  useDefaultBreadcrumbs();
  useSEO(location.pathname, {
    title: "Executive Compensation Analyzer · hired.video",
    description:
      "Break down a total-comp offer — base, bonus, equity (vested), and sign-on — into one comparable annualized number. Built for senior executives.",
    ogTitle: "Executive Comp Analyzer",
    ogDescription: "Compare exec offers on total comp, not base salary.",
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
    { label: "Base salary", value: result.baseSalary, share: result.composition.base },
    { label: "Target bonus", value: result.targetBonus, share: result.composition.bonus },
    { label: "Equity (per year)", value: result.annualEquity, share: result.composition.equity },
    { label: "Sign-on (amortized)", value: result.annualizedSignOn, share: result.composition.signOn },
    { label: "Benefits / 401k", value: result.benefitsValue, share: result.composition.benefits },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <section className="px-4 py-12 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Executive compensation analyzer</h1>
        <p className="text-muted-foreground mb-8">
          Exec packages are 60-80% non-base. Enter the components to see annualized total comp and
          how the offer is really weighted.
        </p>

        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardContent className="p-6 space-y-4">
              <Field label="Base salary (annual)" value={input.baseSalary} onChange={set("baseSalary")} />
              <Field label="Target bonus (annual)" value={input.targetBonus} onChange={set("targetBonus")} />
              <Field label="Equity grant value (total)" value={input.equityGrantValue} onChange={set("equityGrantValue")} />
              <Field label="Vesting years" value={input.vestingYears} onChange={set("vestingYears")} step />
              <Field label="Sign-on bonus (one-time)" value={input.signOnBonus} onChange={set("signOnBonus")} />
              <Field label="Benefits / 401k (annual value)" value={input.benefitsValue} onChange={set("benefitsValue")} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">Annualized total comp</p>
                <p className="text-3xl font-bold">{fmt(result.annualizedTotal)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Year 1 (full sign-on): <span className="font-medium text-foreground">{fmt(result.yearOneTotal)}</span>
                </p>
              </div>
              <Badge variant={baseShare < 50 ? "secondary" : "outline"} className="mb-4">
                Base is {baseShare}% of total
                {baseShare < 50 ? " — equity/bonus-heavy" : ""}
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
          Estimates only — equity value depends on strike price, preferred stack, dilution, and liquidity timing.
          Not financial advice.
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

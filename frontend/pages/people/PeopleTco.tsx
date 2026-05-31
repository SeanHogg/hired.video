import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tcoApi, type TcoBreakdown } from "@/lib/people-ops/api";

const ASSUMPTION_FIELDS: { key: string; label: string }[] = [
  { key: "payrollTaxesPct", label: "Payroll taxes %" },
  { key: "benefitsPct", label: "Benefits %" },
  { key: "perksPct", label: "Perks %" },
  { key: "overheadPct", label: "Overhead %" },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function PeopleTco() {
  useSEO("/people/tco");
  useBreadcrumbs([
    { name: "People Operations", url: "/people" },
    { name: "Employee TCO", url: "/people/tco" },
  ]);
  const [assumptions, setAssumptions] = useState<Record<string, number>>({});
  const [salary, setSalary] = useState("120000");
  const [result, setResult] = useState<TcoBreakdown | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    tcoApi.assumptions().then(setAssumptions).catch((e) => {
      if (/paid|upgrade/i.test(e instanceof Error ? e.message : "")) setUpgrade(true);
    });
  }, []);

  const saveAssumptions = async () => {
    const next = await tcoApi.saveAssumptions(assumptions);
    setAssumptions(next);
  };
  const calculate = async () => setResult(await tcoApi.calculate(Number(salary)));

  if (upgrade) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-6 py-16 max-w-2xl mx-auto text-center space-y-4">
          <h1 className="text-3xl font-bold">People Operations is a paid employer feature</h1>
          <Link to="/people-operations" className="text-primary underline">See plans &amp; features</Link>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="px-6 py-8 space-y-6 max-w-3xl">
        <div>
          <Link to="/people" className="text-sm text-muted-foreground hover:underline">← People Operations</Link>
          <h1 className="text-3xl font-bold tracking-tight">Employee TCO</h1>
          <p className="text-muted-foreground">Turn a salary into fully-loaded cost using your company's cost assumptions.</p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Cost assumptions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {ASSUMPTION_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    type="number" step="0.01"
                    value={assumptions[f.key] ?? 0}
                    onChange={(e) => setAssumptions({ ...assumptions, [f.key]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={saveAssumptions}>Save assumptions</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Calculator</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Annual salary ($)</Label>
                <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
              </div>
              <Button onClick={calculate}>Calculate</Button>
            </div>
            {result && (
              <div className="text-sm space-y-1 pt-2">
                {([
                  ["Base salary", result.annualSalary], ["Payroll taxes", result.payrollTaxes],
                  ["Benefits", result.benefits], ["Perks", result.perks], ["Overhead", result.overhead],
                  ["Recruiting (amortized)", result.recruiting], ["Training (amortized)", result.training],
                ] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b py-1"><span className="text-muted-foreground">{k}</span><span>{usd(v)}</span></div>
                ))}
                <div className="flex justify-between pt-2 font-semibold"><span>Total loaded cost / yr</span><span>{usd(result.totalLoadedCost)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>Monthly</span><span>{usd(result.monthlyLoadedCost)}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

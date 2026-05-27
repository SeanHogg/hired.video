import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ArrowRight,
  Loader2,
  Search,
  DollarSign,
  Star,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ToolShell } from "@/components/tools/ToolShell";
import { apiClient } from "@/lib/api-client";
import { companyService, type CompanyMetadata } from "@/lib/services/company-service";
import { slugify } from "@shared/slugify";

interface SalaryData {
  averageSalary: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  sampleSize: number;
}

interface CompanyHit {
  id: string;
  slug?: string;
  name: string;
  industry?: string;
  location?: string;
  reviewCount?: number;
  rating?: number;
}

function fmt(n: number | null) {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function EmployerResearch() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");

  const [running, setRunning] = useState(false);
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [companies, setCompanies] = useState<CompanyHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runResearch = async () => {
    if (!company.trim() && !role.trim()) {
      setError("Enter a company name or a role to research.");
      return;
    }
    setError(null);
    setRunning(true);
    setSalary(null);
    setCompanies(null);

    const tasks: Promise<unknown>[] = [];

    if (company.trim()) {
      tasks.push(
        companyService
          .searchCompanies({ search: company.trim(), page: 1, limit: 6 })
          .then((result) => {
            const list = (result.items ?? []) as CompanyMetadata[];
            setCompanies(
              list.map((c) => ({
                id: c.id,
                slug: (c as any).slug,
                name: c.name,
                industry: (c as any).industry,
                location: (c as any).location ?? (c as any).headquarters,
                reviewCount: (c as any).reviewCount ?? undefined,
                rating: (c as any).reviewAvgOverall ?? undefined,
              })),
            );
          })
          .catch(() => setCompanies([])),
      );
    }

    if (role.trim()) {
      const roleSlug = slugify(role, { fallback: "role" });
      const citySlug = city.trim()
        ? slugify(city, { fallback: "city" })
        : null;
      const path = citySlug
        ? `/api/discovery/seo/salary/${roleSlug}/${citySlug}`
        : `/api/discovery/seo/salary/${roleSlug}`;
      tasks.push(
        apiClient
          .get(path, null as any)
          .then((res: any) => setSalary(res.data ?? null))
          .catch(() => setSalary(null)),
      );
    }

    try {
      await Promise.all(tasks);
    } finally {
      setRunning(false);
    }
  };

  const roleSlug = role.trim() ? slugify(role, { fallback: "role" }) : null;
  const citySlug = city.trim() ? slugify(city, { fallback: "city" }) : null;
  const salaryPagePath =
    roleSlug && citySlug
      ? `/salary/${roleSlug}/${citySlug}`
      : roleSlug
        ? `/salary/${roleSlug}`
        : null;

  return (
    <ToolShell
      toolId="employer-research"
      header={{
        icon: <Building2 className="h-6 w-6 text-brand-purple" />,
        iconBgClassName: "bg-purple-100",
        title: "Employer Research",
        description:
          "Pressure-test a company and an offer in 10 minutes — multi-axis reviews + role × city salary data, side by side.",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Research Inputs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Company</label>
                <Input
                  placeholder="e.g., Acme Robotics"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Role</label>
                <Input
                  placeholder="e.g., Senior Software Engineer"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">City</label>
                <Input
                  placeholder="e.g., San Francisco"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <Button
                onClick={runResearch}
                disabled={running}
                className="w-full"
                size="lg"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Researching…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Run Research
                  </>
                )}
              </Button>

              {error && (
                <Alert>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardContent className="p-5 text-sm space-y-3">
              <p className="font-semibold">What you get</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Company matches with multi-axis review ratings</li>
                <li>Average / min / max salary for the role × city pair</li>
                <li>Deeplinks into the full reviews + salary guide pages</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {companies !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Companies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No companies matched “{company}”. Try a shorter name or check
                    spelling.
                  </p>
                )}
                {companies.map((c) => {
                  const slugOrId = c.slug ?? c.id;
                  return (
                    <div
                      key={c.id}
                      className="flex items-start justify-between gap-3 border rounded-md p-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.industry, c.location].filter(Boolean).join(" · ") ||
                            "Company"}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          {typeof c.rating === "number" && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                              {c.rating.toFixed(1)}
                            </Badge>
                          )}
                          {typeof c.reviewCount === "number" && c.reviewCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {c.reviewCount} review
                              {c.reviewCount === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/companies/${slugOrId}/reviews`}>
                            Reviews <ExternalLink className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/companies/${slugOrId}`}>
                            Profile <ArrowRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {salary !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Salary — {role}
                  {city ? ` in ${city}` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {salary.sampleSize === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No active listings matched this role
                    {city ? ` in ${city}` : ""}. Try a broader role keyword or
                    drop the city to see the national figure.
                  </p>
                ) : (
                  <>
                    <div className="text-center p-4 bg-gradient-to-r from-brand-green/10 to-brand-blue/10 rounded-lg">
                      <div className="text-3xl font-bold text-brand-green">
                        {fmt(salary.averageSalary)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Average · based on {salary.sampleSize} active listing
                        {salary.sampleSize === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="text-center p-3 bg-muted rounded-md">
                        <div className="font-semibold">{fmt(salary.minSalary)}</div>
                        <div className="text-xs text-muted-foreground">Min</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-md">
                        <div className="font-semibold">{fmt(salary.maxSalary)}</div>
                        <div className="text-xs text-muted-foreground">Max</div>
                      </div>
                    </div>
                  </>
                )}
                {salaryPagePath && (
                  <Button asChild variant="outline" className="w-full">
                    <Link to={salaryPagePath}>
                      Open full salary guide
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {companies === null && salary === null && !running && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                <Search className="h-10 w-10 mx-auto mb-3" />
                Enter a company, role, or both, then run research to see reviews
                and salary data side by side.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ToolShell>
  );
}

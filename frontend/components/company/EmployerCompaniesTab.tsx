import { useEffect, useState } from "react";
import { publicCompanyPath } from "@shared/public-paths";
import { Link } from "react-router-dom";
import { Building2, Plus, Globe, Users as UsersIcon, Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { companyService, type CompanyMetadata } from "@/lib/services/company-service";
import { roleUtils } from "@/lib/role-utils";
import { studioEditHref, studioNewEntityHref } from "@/lib/studio/studio-authoring";

interface EmployerCompaniesTabProps {
  profileUserId: string;
  profileRole: string | number | null | undefined;
  isOwner: boolean;
}

/**
 * Self-gating Company tab content for the People profile. Renders the
 * employer's company cards, or an empty-state CTA. Returns null when
 * the profile owner isn't an employer — caller can still call this
 * unconditionally and the gate keeps non-employer profiles untouched.
 */
export default function EmployerCompaniesTab({
  profileUserId,
  profileRole,
  isOwner,
}: EmployerCompaniesTabProps) {
  const isEmployer = roleUtils.isEmployer(profileRole);
  const [companies, setCompanies] = useState<CompanyMetadata[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isEmployer || !profileUserId) return;
    let cancelled = false;
    setLoading(true);
    companyService
      .getCompaniesByUserId(profileUserId)
      .then((rows) => {
        if (!cancelled) setCompanies(rows);
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEmployer, profileUserId]);

  if (!isEmployer) return null;

  if (loading && companies === null) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!companies || companies.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {isOwner ? "No company yet" : "No company linked"}
          </h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            {isOwner
              ? "Create your company page so candidates know who they're applying to and you can post jobs under your brand."
              : "This employer hasn't linked a company profile to their account yet."}
          </p>
          {isOwner && (
            <Button asChild>
              <Link to={studioNewEntityHref("company")}>
                <Plus className="h-4 w-4 mr-2" />
                Create your company
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {companies.map((company) => (
        <Card key={company.id ?? company.slug ?? company.name} className="overflow-hidden">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <Avatar className="w-14 h-14 rounded-lg">
                <AvatarImage src={company.logo ?? undefined} alt={company.name ?? ""} />
                <AvatarFallback className="rounded-lg bg-primary/10 text-primary">
                  {(company.name ?? "C").substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={publicCompanyPath(company.id ?? "")}
                      className="font-semibold text-lg hover:underline truncate block"
                    >
                      {company.name ?? "Untitled company"}
                    </Link>
                    {company.tagline && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {company.tagline}
                      </p>
                    )}
                  </div>
                  {isOwner && (
                    <Button asChild variant="outline" size="sm">
                      <Link to={studioEditHref("company", company.id ?? "")}>Edit</Link>
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                  {company.industry && (
                    <Badge variant="secondary" className="text-[11px]">
                      {company.industry}
                    </Badge>
                  )}
                  {company.size && (
                    <span className="flex items-center gap-1">
                      <UsersIcon className="h-3 w-3" />
                      {company.size}
                    </span>
                  )}
                  {(company.activeJobCount ?? 0) > 0 && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3 w-3" />
                      {company.activeJobCount} open role{company.activeJobCount === 1 ? "" : "s"}
                    </span>
                  )}
                  {company.website && (
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-primary"
                    >
                      <Globe className="h-3 w-3" />
                      Website
                    </a>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {isOwner && (
        <Button asChild variant="outline" className="w-full">
          <Link to={studioNewEntityHref("company")}>
            <Plus className="h-4 w-4 mr-2" />
            Add another company
          </Link>
        </Button>
      )}
    </div>
  );
}

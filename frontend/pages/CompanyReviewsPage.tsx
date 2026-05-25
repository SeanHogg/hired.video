/**
 * Dedicated company-reviews SEO surface at /companies/:slug/reviews.
 *
 * Why a separate page instead of just a tab on CompanyDetail
 * ----------------------------------------------------------
 * Glassdoor-style review URLs are how candidates search for "{company}
 * reviews" intent. A dedicated URL gives us:
 *   - title + meta tuned for review intent (rating in title, count in desc)
 *   - AggregateRating JSON-LD that Google can surface as stars in SERPs
 *   - canonical separate from the marketing /companies/:id surface
 *   - sitemap inclusion only when the company actually has reviews
 *
 * The actual reviews UI is the same shared ReviewsSection mounted on
 * CompanyDetail — only the chrome around it differs.
 */

import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { ArrowLeft, Building2, MapPin } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { AppShell } from "@/components/AppShell";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import { ReviewRatingBadge } from "@/components/reviews/ReviewRatingBadge";
import { useBreadcrumbs } from "@/lib/seo";
import { useUgcSeo } from "@/lib/seo-ugc";

import { useAuth } from "@/lib/auth";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import { companyService, type CompanyProfile } from "@/lib/services/company-service";

export default function CompanyReviewsPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setErrored(false);
    companyService
      .getCompanyProfileById(slug)
      .then((c) => setCompany(c))
      .catch(() => setErrored(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const ownerUserId = (company as any)?.data?.ownerUserId ?? company?.userId ?? null;
  const { isOwner } = useEntityOwnership({ ownerUserId });

  useUgcSeo("companyReviews", company);
  useBreadcrumbs(
    company
      ? [
          { name: "Companies", url: "/companies" },
          { name: company.data.name, url: `/companies/${company.slug ?? company.id}` },
          { name: "Reviews", url: location.pathname },
        ]
      : [{ name: "Companies", url: "/companies" }],
  );

  return (
    <AppShell bgClassName="bg-background">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:px-6 lg:px-8 space-y-6">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        )}

        {errored && !loading && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Couldn't load reviews for this company.{" "}
                <Link to="/companies" className="text-primary underline">
                  Browse all companies
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        )}

        {company && !loading && (
          <>
            <nav className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Link to="/" className="hover:text-foreground">
                Home
              </Link>
              <span>/</span>
              <Link to="/companies" className="hover:text-foreground">
                Companies
              </Link>
              <span>/</span>
              <Link
                to={`/companies/${company.slug ?? company.id}`}
                className="hover:text-foreground"
              >
                {company.data.name}
              </Link>
              <span>/</span>
              <span className="text-foreground">Reviews</span>
            </nav>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14">
                    {company.data.logo ? (
                      <AvatarImage src={company.data.logo} alt={company.data.name} />
                    ) : null}
                    <AvatarFallback>
                      {company.data.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold leading-tight">
                      {company.data.name} Reviews
                    </h1>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {company.data.industry && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {company.data.industry}
                        </span>
                      )}
                      {(company.data.headquarters?.city ||
                        company.data.headquarters?.state) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {[
                            company.data.headquarters?.city,
                            company.data.headquarters?.state,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                      <ReviewRatingBadge
                        size="md"
                        value={(company as any).reviewAvgOverall ?? null}
                        count={(company as any).reviewCount ?? 0}
                      />
                    </div>
                  </div>

                  <Button asChild variant="outline" size="sm">
                    <Link to={`/companies/${company.slug ?? company.id}`}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Profile
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <ReviewsSection
              subjectType="company"
              subjectId={company.id}
              subjectName={company.data.name}
              isOwner={!!isOwner}
            />

            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground text-center">
                <Link to="/login" className="text-primary underline">
                  Sign in
                </Link>{" "}
                to leave a review of {company.data.name}.
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

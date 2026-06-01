/**
 * LocationResources — the community-curated resource directory rendered on
 * /in/:country/:state location pages. Shows approved resources (government
 * agencies, job boards, unemployment offices, training, legal aid…) and
 * invites viewers to contribute their own (points + Local Guide badge).
 *
 * Each card carries a link and/or a phone number plus a Report flag so the
 * community can surface dead links / bad info to the SuperAdmin queue (which
 * also emails the moderator). Self-gates auth on the "Suggest" CTA.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { ExternalLink, Loader2, MapPin, Phone, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import { useAuth } from "@/lib/auth";
import {
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_CATEGORY_LABEL,
} from "@shared/community-resources";
import {
  communityResourcesService,
  type CommunityResource,
} from "@/lib/services/community-resources-service";

const SubmitResourceDialog = lazy(() => import("./SubmitResourceDialog"));

interface Props {
  countryCode: string;
  stateCode?: string | null;
  citySlug?: string | null;
  locationLabel: string;
}

export default function LocationResources({
  countryCode,
  stateCode,
  citySlug,
  locationLabel,
}: Props) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [resources, setResources] = useState<CommunityResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await communityResourcesService.listDirectory({
        country: countryCode,
        state: stateCode ?? undefined,
        city: citySlug ?? undefined,
      });
      setResources(rows);
    } catch {
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, stateCode, citySlug]);

  function openSubmit() {
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setDialogOpen(true);
  }

  return (
    <section className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <MapPin className="h-5 w-5 text-primary" />
            Local resources in {locationLabel}
          </h2>
          <p className="text-muted-foreground mt-1">
            Community-curated agencies, job boards, and services for job seekers and employers.
          </p>
        </div>
        <Button onClick={openSubmit} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Suggest a resource
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : resources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MapPin className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No resources here yet</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Be the first to add a helpful agency or service for {locationLabel} — you'll earn points
              and the Local Guide badge.
            </p>
            <Button size="sm" variant="outline" onClick={openSubmit} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add the first resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {resources.map((r) => (
            <ResourceCard key={r.id} resource={r} onReported={load} />
          ))}
        </div>
      )}

      {dialogOpen && (
        <Suspense fallback={null}>
          <SubmitResourceDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            countryCode={countryCode}
            stateCode={stateCode}
            citySlug={citySlug}
            locationLabel={locationLabel}
            onSubmitted={load}
          />
        </Suspense>
      )}
    </section>
  );
}

function ResourceCard({
  resource,
  onReported,
}: {
  resource: CommunityResource;
  onReported: () => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{resource.title}</CardTitle>
          <ReportAbuseButton
            entityType="community_resource"
            entityId={resource.id}
            entityOwnerId={resource.submittedBy ?? undefined}
            entityLabel="resource"
            onReported={onReported}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Badge variant="secondary" className="text-[10px]">
            {RESOURCE_CATEGORY_LABEL[resource.category]}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {RESOURCE_AUDIENCE_LABEL[resource.audience]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-sm text-muted-foreground line-clamp-4">{resource.description}</p>
        <div className="mt-auto flex flex-col gap-2">
          {resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visit website
            </a>
          )}
          {resource.phone && (
            <a
              href={`tel:${resource.phone.replace(/[^0-9+]/g, "")}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {resource.phone}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

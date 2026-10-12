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
import { useTranslation } from "react-i18next";
import { ExternalLink, Loader2, MapPin, Phone, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarketingSectionIntro } from "@/components/marketing/MarketingBand";
import MonoChip from "@/components/templates/MonoChip";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import { useAuth } from "@/lib/auth";
import { resourceAudienceLabel, resourceCategoryLabel } from "@/lib/community-resources/localize";
import {
  communityResourcesService,
  type CommunityResource,
} from "@/lib/services/community-resources-service";

const SubmitResourceDialog = lazy(() => import("./SubmitResourceDialog"));

const TITLE_ID = "location-resources-title";

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
  const { t } = useTranslation();
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
    <section aria-labelledby={TITLE_ID} className="flex w-full flex-col gap-8 px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <MarketingSectionIntro
          id={TITLE_ID}
          title={t("locationResources.title", { place: locationLabel })}
          subtitle={t("locationResources.subtitle")}
        />
        <Button onClick={openSubmit} className="min-h-[44px] gap-1.5">
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("locationResources.suggest")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-label={t("status.loading")}>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[20px] border border-border bg-card p-6 py-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
            <MapPin className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-base font-semibold text-foreground">{t("locationResources.emptyTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("locationResources.emptyBody", { place: locationLabel })}
          </p>
          <Button variant="outline" onClick={openSubmit} className="min-h-[44px] gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("locationResources.addFirst")}
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-5">
          {resources.map((r) => (
            <ResourceCard key={r.id} resource={r} onReported={load} />
          ))}
        </ul>
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
  const { t } = useTranslation();
  return (
    <li className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-snug text-foreground">{resource.title}</h3>
        <ReportAbuseButton
          entityType="community_resource"
          entityId={resource.id}
          entityOwnerId={resource.submittedBy ?? undefined}
          entityLabel={t("labels.resource").toLowerCase()}
          onReported={onReported}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <MonoChip>{resourceCategoryLabel(resource.category, t)}</MonoChip>
        <MonoChip>{resourceAudienceLabel(resource.audience, t)}</MonoChip>
      </div>
      <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">{resource.description}</p>
      <div className="mt-auto flex flex-col gap-1 pt-1">
        {resource.url && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {t("partnerConnect.visitWebsite")}
          </a>
        )}
        {resource.phone && (
          <a
            href={`tel:${resource.phone.replace(/[^0-9+]/g, "")}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 font-mono text-sm text-foreground hover:underline"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            {resource.phone}
          </a>
        )}
      </div>
    </li>
  );
}

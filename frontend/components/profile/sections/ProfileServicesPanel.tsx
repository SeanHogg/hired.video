// Profile Services tab — single component for both audiences.
//
// Responsibilities:
//   • Owner view  → list owner's active services (regardless of the
//                   `userProfiles.providesServices` toggle) so the owner
//                   always sees what they have. Empty list falls back to
//                   the "Sell your expertise on your profile" CTA.
//   • Visitor view → list the target user's public services. Empty list
//                   renders nothing (the visitor doesn't need a CTA).
//
// The CTA + the list both live inside this component (DRY rule). Consumers
// pass `userId` + `isOwner` only — the panel self-fetches and self-gates
// its visibility.
//
// Replaces the old `ServicesSection` + caller-side fetch in `useProfileView`.

import { useEffect, useState } from "react";
import { Briefcase, Clock, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AddFirstServiceCTA from "@/components/services/AddFirstServiceCTA";
import ReportAbuseButton from "@/components/moderation/ReportAbuseButton";
import { serviceCategoryLabel } from "@/lib/taxonomy/category-labels";
import { servicesService, type ServiceOffering } from "@/lib/services/services-service";
import { userService } from "@/lib/services/user-service";

interface Props {
  /** The profile owner's user id. */
  userId: string;
  /** Whether the current viewer owns this profile. */
  isOwner: boolean;
  /** Provider's first name — used in the visitor-facing card subtitle. */
  providerFirstName?: string;
  /** Visitor action — add a fixed-price service to cart. Owner is read-only. */
  onAddToCart?: (service: ServiceOffering) => void;
  /** Visitor action — request a quote on a quote-only service. */
  onRequestQuote?: (service: ServiceOffering) => void;
}

export default function ProfileServicesPanel({
  userId,
  isOwner,
  providerFirstName,
  onAddToCart,
  onRequestQuote,
}: Props) {
  const { t } = useTranslation();
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [providesServices, setProvidesServices] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        if (isOwner) {
          // Owner sees their full active list — bypasses the
          // `providesServices` gate that hides the listing from
          // visitors. Inactive offerings stay hidden everywhere.
          const [mine, me] = await Promise.all([
            servicesService.listMyServices().catch(() => [] as ServiceOffering[]),
            userService.getCurrentUser().catch(() => null),
          ]);
          if (cancelled) return;
          setServices(mine.filter((s) => s.isActive));
          setProvidesServices(me?.providesServices ?? null);
        } else {
          const list = await servicesService
            .getPublicServices(userId)
            .catch(() => [] as ServiceOffering[]);
          if (cancelled) return;
          setServices(list);
          setProvidesServices(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [userId, isOwner]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading services…
        </CardContent>
      </Card>
    );
  }

  // Visitor with nothing to show — render nothing.
  if (services.length === 0 && !isOwner) return null;

  // Owner with no listings — show the marketing CTA.
  if (services.length === 0 && isOwner) {
    return <AddFirstServiceCTA href="/services/offerings" />;
  }

  return (
    <div className="space-y-3">
      {/* Owner-only warning: services exist but `providesServices` is off,
          so visitors see an empty Services tab. Surfaces the drift instead
          of leaving the owner to wonder why nobody's buying. */}
      {isOwner && providesServices === false && (
        <Card className="border-amber-300/50 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Your services are hidden from your profile</p>
              <p className="text-muted-foreground mt-0.5">
                Visitors won't see this list until you flip on Lead Generation.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/settings?tab=lead-generation">Enable</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-violet-600" />
            {t("headings.services")}
          </CardTitle>
          <CardDescription>
            {t("labels.servicesByProvider", {
              provider: providerFirstName ?? t("labels.thisUser"),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {services.map((svc) => (
            <ServiceRow
              key={svc.id}
              service={svc}
              isOwner={isOwner}
              ownerUserId={userId}
              onAddToCart={onAddToCart}
              onRequestQuote={onRequestQuote}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

interface ServiceRowProps {
  service: ServiceOffering;
  isOwner: boolean;
  /** Provider user id — owner of the offering, for report self-gating. */
  ownerUserId: string;
  onAddToCart?: (service: ServiceOffering) => void;
  onRequestQuote?: (service: ServiceOffering) => void;
}

function ServiceRow({ service, isOwner, ownerUserId, onAddToCart, onRequestQuote }: ServiceRowProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{service.title}</span>
          {service.category && (
            <Badge variant="secondary" className="text-xs">
              {serviceCategoryLabel(service.category, t)}
            </Badge>
          )}
        </div>
        {service.description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
            {service.description}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-sm">
          {service.priceCents !== null ? (
            <span className="font-semibold text-violet-600">
              ${(service.priceCents / 100).toFixed(2)}
            </span>
          ) : (
            <span className="text-muted-foreground italic">
              {t("labels.contactForPricing")}
            </span>
          )}
          {service.deliveryDays && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {t("labels.deliveryDays", { days: service.deliveryDays })}
            </span>
          )}
        </div>
      </div>
      {!isOwner && (
        <div className="shrink-0 flex items-center gap-1">
          {service.priceCents !== null ? (
            <Button size="sm" onClick={() => onAddToCart?.(service)}>
              {t("actions.addToCart")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRequestQuote?.(service)}
            >
              {t("actions.requestQuote")}
            </Button>
          )}
          {/* Report this offering — self-gates (hidden for the provider,
              bounces anon to /login). */}
          <ReportAbuseButton
            entityType="service"
            entityId={service.id}
            entityOwnerId={ownerUserId}
            entityLabel="service"
          />
        </div>
      )}
    </div>
  );
}

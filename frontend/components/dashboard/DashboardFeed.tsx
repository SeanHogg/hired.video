import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Sparkles } from "lucide-react";
import {
  feedFeaturesService,
} from "@/lib/services/feed-features-service";
import type { FeedFeatureCard } from "@shared/feed-features";
import type { UserRole } from "@shared/user-roles";
import { useFeedCardRenderer, feedEntityHref } from "@/lib/feed-card-renderer";

/**
 * The SuperAdmin-curated feed that fills an otherwise-empty dashboard.
 *
 * Self-gating: renders nothing until cards load, and nothing at all when
 * the viewer's role has no curated cards — so a dashboard with its own
 * content isn't pushed down by an empty heading. The empty-state copy only
 * shows when explicitly asked (the job-seeker first-login surface), so a
 * brand-new user never sees a blank page.
 *
 * Every card renders through the shared useFeedCardRenderer hook (same
 * mapping as /search), so any content type the platform can show as a card
 * shows here.
 */
interface DashboardFeedProps {
  /** SA preview override; omit to use the viewer's own role (the default,
   *  resolved server-side from the JWT). */
  role?: UserRole | string;
  /** Show a friendly empty-state instead of rendering null when there are
   *  no curated cards. Use on the primary (job-seeker) dashboard so a new
   *  account isn't greeted by a blank page. */
  showEmptyState?: boolean;
  className?: string;
}

export function DashboardFeed({
  role,
  showEmptyState = false,
  className,
}: DashboardFeedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [cards, setCards] = React.useState<FeedFeatureCard[] | null>(null);

  React.useEffect(() => {
    let active = true;
    feedFeaturesService
      .getForRole(role)
      .then((c) => {
        if (active) setCards(c);
      })
      .catch(() => {
        if (active) setCards([]);
      });
    return () => {
      active = false;
    };
  }, [role]);

  const handleView = React.useCallback(
    (item: any) => {
      const href = feedEntityHref(item);
      if (href) navigate(href);
    },
    [navigate],
  );

  const renderCard = useFeedCardRenderer({ onView: handleView });

  // Loading — reserve nothing; the dashboard's own widgets fill the space.
  if (cards === null) {
    return (
      <section className={className} aria-busy>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (cards.length === 0) {
    if (!showEmptyState) return null;
    return (
      <section className={className}>
        <FeedHeading t={t} />
        <div className="text-center py-10 border border-dashed border-border rounded-lg">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "dashboardFeed.empty",
              "Fresh picks and resources will appear here soon.",
            )}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={className}>
      <FeedHeading t={t} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {cards.map((card, i) => (
          <React.Fragment key={card.featureId ?? `${card.type}-${card.id}`}>
            {renderCard(card, i)}
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}

function FeedHeading({ t }: { t: TFunction }) {
  return (
    <div className="flex items-center gap-2 mb-3 sm:mb-4">
      <Sparkles className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-semibold text-foreground">
        {t("dashboardFeed.title", "Featured for you")}
      </h2>
    </div>
  );
}

export default DashboardFeed;

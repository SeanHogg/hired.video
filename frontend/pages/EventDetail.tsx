/**
 * /events/[slugOrId] — event detail page.
 *
 * Renders the cover, host card, RSVP control (shared <RsvpButton/>),
 * attendees list (opt-in), and share controls. Owner/co-host edit shortcuts
 * defer to /events/[id]/manage.
 */
import { useEffect, useState } from "react";
import { publicProfilePath } from "@shared/public-paths";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useBreadcrumbs } from "@/lib/seo";
import { useUgcSeo } from "@/lib/seo-ugc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar, MapPin, Users, Video, Share2, ExternalLink, Sparkles, BadgeCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { eventsService, type EventAttendeePublic } from "@/lib/services/events-service";
import { RsvpButton } from "@/components/events/RsvpButton";
import { EventBadge } from "@/components/events/EventBadge";
import { AttendeeMatches } from "@/components/events/AttendeeMatches";
import { CONTENT_CARD, INDEX_COLUMN } from "@/components/content/content-ui";
import { HERO_CTA_PRIMARY } from "@/components/marketing/MarketingHero";
import { cn } from "@/lib/utils";
import type { ResolvedEvent } from "@shared/events";

const ATTENDEE_PREVIEW = 24;
const EVENTS_HOME = "/tasks?surface=discover";

export default function EventDetail() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ idOrSlug: string }>();
  const idOrSlug = params.idOrSlug ?? "";

  const [event, setEvent] = useState<ResolvedEvent | null>(null);
  const [attendees, setAttendees] = useState<EventAttendeePublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Per-event title/description + Event JSON-LD (falls back to the static
  // /events/:idOrSlug PAGE_SEO while the event loads). `ResolvedEvent` is a
  // structural superset of the adapter's EventRecord.
  useUgcSeo("event", event);
  useBreadcrumbs(
    event
      ? [
          { name: t("search.category.events"), url: EVENTS_HOME },
          { name: event.title, url: `/events/${event.slug ?? event.id}` },
        ]
      : [{ name: t("search.category.events"), url: EVENTS_HOME }],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    eventsService
      .get(idOrSlug)
      .then((ev) => {
        if (cancelled) return;
        setEvent(ev);
        return eventsService.listAttendees(ev.id);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setAttendees(res.attendees);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrSlug]);

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <main className={cn(INDEX_COLUMN, "py-10")} aria-busy="true">
          <div className="mb-6 aspect-[3/1] animate-pulse rounded-[20px] bg-muted" />
          <div className="mb-3 h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mb-6 h-4 w-1/2 animate-pulse rounded bg-muted" />
        </main>
      </AppShell>
    );
  }

  if (notFound || !event) {
    return (
      <AppShell bgClassName="bg-background">
        <main className={cn(INDEX_COLUMN, "flex flex-col items-center gap-3 py-20 text-center")}>
          <h1 className="font-display text-[clamp(28px,3.4vw,40px)] font-bold tracking-[-0.03em] text-foreground">
            {t("eventDetail.notFound")}
          </h1>
          <p className="text-muted-foreground">{t("eventDetail.notFoundBody")}</p>
          <Link to={EVENTS_HOME} className={cn(HERO_CTA_PRIMARY, "mt-3")}>
            {t("eventDetail.browse")}
          </Link>
        </main>
      </AppShell>
    );
  }

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const dateRange = `${start.toLocaleString(i18n.language)} – ${end.toLocaleTimeString(i18n.language)}`;

  async function shareLink() {
    const url = `${window.location.origin}/events/${event!.slug ?? event!.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: event!.title, url });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* swallow */
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className={cn(INDEX_COLUMN, "pb-[72px] pt-6")}>
        {/* Cover */}
        <div className="relative aspect-[3/1] overflow-hidden rounded-[20px] border border-border bg-muted">
          {event.coverImageUrl ? (
            <img src={event.coverImageUrl} alt={event.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-primary">
              <Calendar className="h-16 w-16" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <EventBadge category={event.category} eventFormat={event.eventFormat} className="mb-3" />
            <h1 className="mb-4 font-display text-[clamp(32px,4.2vw,52px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
              {event.title}
            </h1>
            <ul className="mb-8 flex flex-col gap-2.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                {dateRange}
              </li>
              {event.location && (
                <li className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {event.location}
                </li>
              )}
              {event.meetingUrl && event.viewerRsvp?.status === "going" && (
                <li className="flex items-center gap-2">
                  <Video className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                  >
                    {t("eventDetail.joinMeeting")}
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </li>
              )}
              <li className="flex items-center gap-2 font-mono text-xs uppercase">
                <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t("eventDetail.going", { count: event.attendeeCount })}
                {event.capacity ? ` / ${event.capacity}` : ""}
                {event.waitlistCount > 0 && ` · ${t("eventDetail.waitlist", { count: event.waitlistCount })}`}
              </li>
            </ul>

            {event.description && (
              <div className="mb-8 whitespace-pre-wrap text-[17px] leading-relaxed text-foreground/85">
                {event.description}
              </div>
            )}

            {/* AI matches — self-gates on matchmakingEnabled + viewer RSVP */}
            <AttendeeMatches event={event} />

            {attendees.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
                  {t("eventDetail.attending", { count: attendees.length })}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {attendees.slice(0, ATTENDEE_PREVIEW).map((a) => (
                    <Link
                      key={a.userId}
                      to={publicProfilePath(a.userId)}
                      className="flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted"
                    >
                      <Avatar className="h-6 w-6">
                        {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                        <AvatarFallback>{a.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {a.name}
                    </Link>
                  ))}
                  {attendees.length > ATTENDEE_PREVIEW && (
                    <span className="self-center font-mono text-xs text-muted-foreground">
                      {t("eventDetail.more", { count: attendees.length - ATTENDEE_PREVIEW })}
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="flex flex-col gap-4">
            <div className={cn(CONTENT_CARD, "p-5")}>
              <RsvpButton event={event} onChange={setEvent} size="lg" className="w-full" />
              <Button variant="outline" className="mt-2 min-h-[44px] w-full" onClick={shareLink}>
                <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {t("actions.share")}
              </Button>
              {event.matchmakingEnabled && event.viewerRsvp?.status === "going" && (
                <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                  {t("eventDetail.aiIntros")}
                </p>
              )}
            </div>

            <div className={cn(CONTENT_CARD, "p-5")}>
              <div className="mb-3 font-mono text-[11px] uppercase text-muted-foreground">{t("eventDetail.hostedBy")}</div>
              <Link to={publicProfilePath(event.hostUserId)} className="flex min-h-[44px] items-center gap-3 hover:text-primary">
                <Avatar>
                  {event.hostAvatarUrl ? <AvatarImage src={event.hostAvatarUrl} alt={event.hostName ?? ""} /> : null}
                  <AvatarFallback>{event.hostName?.charAt(0) ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="inline-flex items-center gap-1 font-semibold">
                  {event.hostName ?? t("eventDetail.host")}
                  {event.hostIsVerified && (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label={t("events.detail.hostVerified")} />
                  )}
                </span>
              </Link>
              {event.coHosts.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 font-mono text-[11px] uppercase text-muted-foreground">{t("eventDetail.coHosts")}</div>
                  <div className="flex -space-x-2">
                    {event.coHosts.map((c) => (
                      <Link key={c.userId} to={publicProfilePath(c.userId)} aria-label={c.name ?? undefined}>
                        <Avatar className="h-8 w-8 border-2 border-card">
                          {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt={c.name ?? ""} /> : null}
                          <AvatarFallback>{c.name?.charAt(0) ?? "?"}</AvatarFallback>
                        </Avatar>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

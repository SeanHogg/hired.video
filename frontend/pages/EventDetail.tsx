/**
 * /events/[slugOrId] — event detail page.
 *
 * Renders the cover, host card, RSVP control (shared <RsvpButton/>),
 * attendees list (opt-in), and share controls. Owner/co-host edit shortcuts
 * defer to /events/[id]/manage which is M6 territory; for v1 they appear
 * as a simple "Edit" link to /events/new?clone=… style flow.
 */
import { useEffect, useState } from "react";
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
import type { ResolvedEvent } from "@shared/events";

export default function EventDetail() {
  const { t } = useTranslation();
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
          { name: "Events", url: "/tasks?surface=discover" },
          { name: event.title, url: `/events/${event.slug ?? event.id}` },
        ]
      : [{ name: "Events", url: "/tasks?surface=discover" }],
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
        <main className="px-4 sm:px-6 lg:px-8 py-10">
          <div className="aspect-[3/1] bg-muted rounded-md animate-pulse mb-6" />
          <div className="h-8 bg-muted rounded w-3/4 mb-3 animate-pulse" />
          <div className="h-4 bg-muted rounded w-1/2 mb-6 animate-pulse" />
        </main>
      </AppShell>
    );
  }

  if (notFound || !event) {
    return (
      <AppShell bgClassName="bg-background">
        <main className="px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-semibold mb-2">Event not found</h1>
          <p className="text-muted-foreground mb-6">
            This event may have been removed or you don't have access.
          </p>
          <Button asChild>
            <Link to="/tasks?surface=discover">Browse events</Link>
          </Button>
        </main>
      </AppShell>
    );
  }

  const start = new Date(event.startAt);
  const end = new Date(event.endAt);

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
      <main className="px-4 sm:px-6 lg:px-8 pb-12">
        {/* Cover */}
        <div className="relative aspect-[3/1] bg-gradient-to-br from-blue-50 to-violet-100 rounded-md overflow-hidden mt-6">
          {event.coverImageUrl ? (
            <img
              src={event.coverImageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-300">
              <Calendar className="w-16 h-16" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          <div className="lg:col-span-2">
            <EventBadge category={event.category} eventFormat={event.eventFormat} className="mb-3" />
            <h1 className="text-3xl font-bold tracking-tight mb-3">{event.title}</h1>
            <div className="space-y-2 text-sm text-muted-foreground mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {start.toLocaleString()} — {end.toLocaleTimeString()}
              </div>
              {event.location && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {event.location}
                </div>
              )}
              {event.meetingUrl && event.viewerRsvp?.status === "going" && (
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4" />
                  <a
                    href={event.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Join meeting
                    <ExternalLink className="w-3 h-3 inline ml-1" />
                  </a>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                {event.attendeeCount} going
                {event.capacity ? ` / ${event.capacity}` : ""}
                {event.waitlistCount > 0 && ` · ${event.waitlistCount} on waitlist`}
              </div>
            </div>

            {event.description && (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap mb-8">
                {event.description}
              </div>
            )}

            {/* AI matches — self-gates on matchmakingEnabled + viewer RSVP */}
            <AttendeeMatches event={event} />

            {/* Attendees */}
            {attendees.length > 0 && (
              <section className="mt-8">
                <h2 className="text-lg font-semibold mb-3">
                  Attending ({attendees.length})
                </h2>
                <div className="flex flex-wrap gap-2">
                  {attendees.slice(0, 24).map((a) => (
                    <Link
                      key={a.userId}
                      to={`/people/${a.userId}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full border hover:bg-muted text-sm"
                    >
                      <Avatar className="w-6 h-6">
                        {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt={a.name} /> : null}
                        <AvatarFallback>{a.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {a.name}
                    </Link>
                  ))}
                  {attendees.length > 24 && (
                    <span className="text-sm text-muted-foreground self-center">
                      +{attendees.length - 24} more
                    </span>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="border rounded-lg p-4 bg-card">
              <RsvpButton event={event} onChange={setEvent} size="lg" className="w-full" />
              <Button variant="outline" className="w-full mt-2" onClick={shareLink}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              {event.matchmakingEnabled && event.viewerRsvp?.status === "going" && (
                <div className="mt-4 text-xs text-muted-foreground flex items-start gap-2">
                  <Sparkles className="w-3 h-3 text-violet-600 flex-shrink-0 mt-0.5" />
                  AI introductions are on for this event. Match suggestions appear after RSVP.
                </div>
              )}
            </div>

            <div className="border rounded-lg p-4 bg-card">
              <div className="text-xs text-muted-foreground mb-2">Hosted by</div>
              <Link
                to={`/people/${event.hostUserId}`}
                className="flex items-center gap-3 hover:underline"
              >
                <Avatar>
                  {event.hostAvatarUrl ? (
                    <AvatarImage src={event.hostAvatarUrl} alt={event.hostName ?? ""} />
                  ) : null}
                  <AvatarFallback>
                    {event.hostName?.charAt(0) ?? "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium inline-flex items-center gap-1">
                  {event.hostName ?? "Host"}
                  {event.hostIsVerified && (
                    <BadgeCheck
                      className="w-4 h-4 text-sky-600 flex-shrink-0"
                      aria-label={t("events.detail.hostVerified")}
                    />
                  )}
                </span>
              </Link>
              {event.coHosts.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  <div className="mb-1">Co-hosts</div>
                  <div className="flex -space-x-2">
                    {event.coHosts.map((c) => (
                      <Link key={c.userId} to={`/people/${c.userId}`}>
                        <Avatar className="w-7 h-7 border-2 border-background">
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

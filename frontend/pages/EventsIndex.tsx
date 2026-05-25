/**
 * /events — public discovery list.
 *
 * Wraps in AppShell + useSEO + useBreadcrumbs + MarketingFAQ per
 * [feedback_new_page_checklist]. Renders the shared <EventCard> tiles
 * to stay consistent with the homepage UnifiedSearch surface.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MarketingFAQ from "@/components/MarketingFAQ";
import { EventCard } from "@/components/EventCard";
import { Calendar, Plus, Search, MapPin, Sparkles } from "lucide-react";
import { eventsService, type EventCategory } from "@/lib/services/events-service";
import type { ResolvedEvent } from "@shared/events";

const FAQ = [
  {
    question: "Who can host an event?",
    answer:
      "Any hired.video member can host. There's no upgrade — create unlimited free events, invite your network, and accept RSVPs.",
  },
  {
    question: "Is hosting events free?",
    answer:
      "Yes. Public RSVPs, waitlists, capacity, co-hosts, attendee matchmaking, reminder cadence — all included. Paid ticketing is on the roadmap; we'll never gate the free hosting flow behind a subscription.",
  },
  {
    question: "What kinds of events work best?",
    answer:
      "In-person meetups, online workshops, panels, career fairs, study groups, hackathons, demos, mixers, talks. Every event automatically gets the AI matchmaking layer so attendees see the people they should meet.",
  },
  {
    question: "How does attendee matchmaking work?",
    answer:
      "Default-on. We use the skill graph + skill evidence from members' profiles to suggest who each attendee should meet, ranked 0-100 with a one-line reason. Hosts can disable it per event.",
  },
];

export default function EventsIndex() {
  useSEO("/events");
  useBreadcrumbs([{ name: "Events", url: "/events" }]);

  const [events, setEvents] = useState<ResolvedEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [format, setFormat] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eventsService.listCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    eventsService
      .search({
        q: q || undefined,
        category: category || undefined,
        format: (format || undefined) as any,
        scope: "upcoming",
        limit: 24,
      })
      .then((list) => setEvents(list))
      .finally(() => setLoading(false));
  }, [q, category, format]);

  return (
    <AppShell bgClassName="bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Hero */}
        <section className="py-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
                <Calendar className="w-5 h-5" />
                In-person & online networking
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                Find your next career conversation
              </h1>
              <p className="text-muted-foreground max-w-2xl">
                Meetups, workshops, panels, coffee chats — with AI-matched introductions to the people you should meet. Hosting is free for everyone.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/map">
                  <MapPin className="w-4 h-4 mr-2" />
                  Map view
                </Link>
              </Button>
              <Button asChild>
                <Link to="/events/new">
                  <Plus className="w-4 h-4 mr-2" />
                  Host an event
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search events…"
              className="pl-9"
            />
          </div>
          <Select value={category || "all"} onValueChange={(v) => setCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={format || "all"} onValueChange={(v) => setFormat(v === "all" ? "" : v)}>
            <SelectTrigger className="w-full md:w-[160px]">
              <SelectValue placeholder="Any format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any format</SelectItem>
              <SelectItem value="in_person">In-person</SelectItem>
              <SelectItem value="remote">Remote</SelectItem>
              <SelectItem value="hybrid">Hybrid</SelectItem>
            </SelectContent>
          </Select>
        </section>

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-[16/9] bg-muted rounded-md animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-lg">
            <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground mb-4">
              No upcoming events match those filters yet.
            </p>
            <Button asChild>
              <Link to="/events/new">Host the first one</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {events.map((ev) => (
              <EventCard
                key={ev.id}
                id={ev.id}
                slug={ev.slug}
                title={ev.title}
                description={ev.description}
                thumbnail={ev.coverImageUrl}
                category={ev.category}
                eventFormat={ev.eventFormat}
                location={ev.location}
                startAt={ev.startAt}
                endAt={ev.endAt}
                attendeeCount={ev.attendeeCount}
                capacity={ev.capacity}
              />
            ))}
          </div>
        )}

        <MarketingFAQ items={FAQ} schemaId="events" />
      </main>
    </AppShell>
  );
}

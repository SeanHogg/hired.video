/**
 * MyEventsTab — surfaces the user's hosted + attending events under the
 * Tasks/Events page. Pure render — reads `/api/events/mine`, renders
 * shared <EventCard> tiles, and links to host-an-event.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Calendar } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventCard } from "@/components/EventCard";
import { eventsService } from "@/lib/services/events-service";
import type { ResolvedEvent } from "@shared/events";

export function MyEventsTab() {
  const [events, setEvents] = useState<ResolvedEvent[]>([]);
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    eventsService
      .listMine(scope)
      .then((list) => {
        if (!cancelled) setEvents(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">My events</h2>
        <div className="flex items-center gap-2">
          <Select value={scope} onValueChange={(v) => setScope(v as any)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="past">Past</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild>
            <Link to="/events/new">
              <Plus className="w-4 h-4 mr-2" />
              Host
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="aspect-[16/9] bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <Calendar className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">
            {scope === "upcoming"
              ? "No upcoming events you're hosting or attending."
              : scope === "past"
                ? "Nothing in your past events."
                : "You don't have any events yet."}
          </p>
          <Button asChild>
            <Link to="/tasks?surface=discover">Browse events</Link>
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
    </div>
  );
}

/**
 * AttendeeMatches — shows AI-ranked introductions for the current viewer
 * on an event detail page. Renders nothing when:
 *   • matchmaking is disabled on the event
 *   • viewer hasn't RSVP'd "going"
 *   • there are no other attendees yet
 *
 * Per the DRY rule, self-gates on the resolved event shape — no consumer
 * prop tells it whether to show.
 */
import { useEffect, useState } from "react";
import { publicProfilePath } from "@shared/public-paths";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sparkles, Loader2 } from "lucide-react";
import { eventsService, type EventMatch } from "@/lib/services/events-service";
import type { ResolvedEvent } from "@shared/events";

interface AttendeeMatchesProps {
  event: ResolvedEvent;
}

export function AttendeeMatches({ event }: AttendeeMatchesProps) {
  const [matches, setMatches] = useState<EventMatch[] | null>(null);
  const [loading, setLoading] = useState(false);

  const shouldRender =
    event.matchmakingEnabled &&
    event.viewerRsvp?.status === "going" &&
    event.viewerRsvp?.approvalStatus === "approved";

  useEffect(() => {
    if (!shouldRender) return;
    setLoading(true);
    eventsService
      .getMatches(event.id)
      .then((res) => setMatches(res.matches ?? []))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [event.id, shouldRender]);

  if (!shouldRender) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-sky-600" />
        People you should meet
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Ranked by complementary skills and shared focus. Send a connection
        request or message before the event.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating introductions…
        </div>
      ) : matches && matches.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {matches.map((m) => (
            <Link
              key={m.userId}
              to={publicProfilePath(m.userId)}
              className="flex items-start gap-3 p-3 border rounded-lg hover:shadow-sm hover:border-sky-200 transition"
            >
              <Avatar>
                {m.avatarUrl ? <AvatarImage src={m.avatarUrl} alt={m.name} /> : null}
                <AvatarFallback>{m.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-medium truncate">{m.name}</div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-medium">
                    {m.score}
                  </span>
                </div>
                {m.headline && (
                  <div className="text-xs text-muted-foreground line-clamp-1">{m.headline}</div>
                )}
                {m.reason && (
                  <div className="text-xs text-sky-700 line-clamp-1 mt-1">{m.reason}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No suggestions yet — once a few more people RSVP, we'll surface introductions here.
        </p>
      )}
    </section>
  );
}

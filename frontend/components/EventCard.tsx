/**
 * EventCard — discovery tile for a public event.
 *
 * Surfaces:
 *   • UnifiedSearch (`/?category=events`) — renders via card-factory.tsx
 *     after the card-feed pipeline pulls events from /api/events.
 *   • Map popover (`/map`) — landing in M4.
 *   • Dashboard "Upcoming Events" widget — landing in M3.
 *
 * Per the DRY rule, every event-list surface routes through this tile;
 * any kind-specific badge (coffee vs. event) decides itself based on
 * the data, not on a consumer-supplied flag.
 */
import { Calendar, MapPin, Users, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface EventCardProps {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  category?: string | null;
  eventFormat?: "in_person" | "remote" | "hybrid" | null;
  location?: string | null;
  startAt: string;
  endAt?: string | null;
  attendeeCount?: number;
  capacity?: number | null;
  onView?: () => void;
}

export function EventCard(props: EventCardProps) {
  const href = props.slug ? `/events/${props.slug}` : `/events/${props.id}`;
  const start = new Date(props.startAt);
  const dayLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const isCoffee = props.category === "coffee";

  return (
    <Link to={href} onClick={props.onView} className="block group">
      <Card className="overflow-hidden hover:shadow-md transition-shadow h-full">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-blue-50 to-violet-100 overflow-hidden">
          {props.thumbnail ? (
            <img
              src={props.thumbnail}
              alt={props.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-blue-300">
              <Calendar className="w-12 h-12" />
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1">
            {isCoffee ? (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Coffee</Badge>
            ) : props.category ? (
              <Badge variant="secondary" className="capitalize">{props.category}</Badge>
            ) : null}
            {props.eventFormat === "remote" && (
              <Badge variant="outline" className="bg-white">
                <Video className="w-3 h-3 mr-1" />
                Remote
              </Badge>
            )}
            {props.eventFormat === "hybrid" && (
              <Badge variant="outline" className="bg-white">
                Hybrid
              </Badge>
            )}
          </div>
        </div>
        <CardContent className="p-4">
          <div className="text-xs text-blue-600 font-medium mb-1">
            {dayLabel} · {timeLabel}
          </div>
          <h3 className="font-semibold text-base line-clamp-2 mb-1 group-hover:text-blue-700">
            {props.title}
          </h3>
          {props.description ? (
            <p className="text-sm text-gray-600 line-clamp-2 mb-2">{props.description}</p>
          ) : null}
          <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
            {props.location ? (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{props.location}</span>
              </span>
            ) : (
              <span />
            )}
            <span className="flex items-center gap-1 flex-shrink-0 ml-2">
              <Users className="w-3 h-3" />
              {props.attendeeCount ?? 0}
              {props.capacity ? ` / ${props.capacity}` : ""}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * EventDiscoveryPanel — public event discovery (search + filter) with a
 * grid / map sub-view toggle, embedded inside the consolidated
 * /tasks "Discover" surface.
 *
 * Replaces the standalone /events (EventsIndex) and /map (MapPage)
 * pages — both URLs now redirect into /tasks?surface=discover with
 * `?view=grid|map` controlling the embedded sub-view. Marketing copy +
 * FAQ live on Tasks.tsx itself (logged-out marketing variant), since
 * events are public.
 *
 * Per [feedback_extract_on_duplication]: this is the single seam for
 * event discovery — no `canX` prop drilling, no duplicate filter UI on
 * the map vs. grid (the same `q/category/format` filters narrow both).
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EventCard } from "@/components/EventCard";
import { Calendar, Coffee, LayoutGrid, MapPin, Plus, Search, Sparkles } from "lucide-react";
import { eventsService, type EventCategory } from "@/lib/services/events-service";
import { apiClient } from "@/lib/api-client";
import type { ResolvedEvent } from "@shared/events";

// Pin glyphs for the map sub-view. Lifted verbatim from the deleted
// MapPage so existing users see the same visual language.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const eventIcon = new L.DivIcon({
  className: "",
  html: `<div style="background:#2563eb;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);border:2px solid white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});
const personIcon = new L.DivIcon({
  className: "",
  html: `<div style="background:#a16207;color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.3);border:2px solid white"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface MapEvent {
  id: string;
  title: string;
  slug: string | null;
  category: string | null;
  eventFormat: string;
  startAt: string;
  attendeeCount: number;
  capacity: number | null;
  lat: number;
  lng: number;
}
interface MapPerson {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  headline: string | null;
  lat: number;
  lng: number;
}
interface MapPayload {
  events: MapEvent[];
  people: MapPerson[];
}

function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds) => void }) {
  const map = useMap();
  useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });
  useEffect(() => {
    onChange(map.getBounds());
  }, [map, onChange]);
  return null;
}

export function EventDiscoveryPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const subView: "grid" | "map" = viewParam === "map" ? "map" : "grid";
  const switchSubView = (next: "grid" | "map") => {
    const sp = new URLSearchParams(searchParams);
    if (next === "grid") sp.delete("view");
    else sp.set("view", next);
    setSearchParams(sp, { replace: false });
  };

  // Shared filter axis: query string, category, format. Drives the grid
  // request directly; the map request narrows server-side on bounds
  // (free-text filter would be a second round-trip — keep map fast and
  // bounds-only for now; tracked as future work in README).
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("");
  const [format, setFormat] = useState<string>("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
            <Calendar className="w-5 h-5" />
            In-person &amp; online networking
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Find your next career conversation
          </h2>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Meetups, workshops, panels, coffee chats — with AI-matched introductions to the people you should meet. Hosting is free for everyone.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5">
            <button
              type="button"
              onClick={() => switchSubView("grid")}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                subView === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => switchSubView("map")}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm flex items-center gap-1.5 transition-colors ${
                subView === "map"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MapPin className="w-4 h-4" />
              Map
            </button>
          </div>
          <Button asChild>
            <Link to="/events/new">
              <Plus className="w-4 h-4 mr-2" />
              Host
            </Link>
          </Button>
        </div>
      </div>

      {subView === "grid" ? (
        <GridSubView
          q={q}
          setQ={setQ}
          category={category}
          setCategory={setCategory}
          format={format}
          setFormat={setFormat}
        />
      ) : (
        <MapSubView />
      )}
    </div>
  );
}

function GridSubView({
  q,
  setQ,
  category,
  setCategory,
  format,
  setFormat,
}: {
  q: string;
  setQ: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  format: string;
  setFormat: (v: string) => void;
}) {
  const [events, setEvents] = useState<ResolvedEvent[]>([]);
  const [categories, setCategories] = useState<EventCategory[]>([]);
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
    <>
      <section className="flex flex-col md:flex-row gap-3">
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
    </>
  );
}

function MapSubView() {
  const [data, setData] = useState<MapPayload>({ events: [], people: [] });
  const [showEvents, setShowEvents] = useState(true);
  const [showPeople, setShowPeople] = useState(true);
  const fetchSeq = useRef(0);

  async function loadFor(bounds: L.LatLngBounds) {
    const seq = ++fetchSeq.current;
    const params = new URLSearchParams({
      minLat: String(bounds.getSouthWest().lat),
      maxLat: String(bounds.getNorthEast().lat),
      minLng: String(bounds.getSouthWest().lng),
      maxLng: String(bounds.getNorthEast().lng),
    });
    try {
      const res = await apiClient.get<MapPayload>(`/api/map?${params.toString()}`);
      if (seq !== fetchSeq.current) return;
      setData(res.data ?? { events: [], people: [] });
    } catch {
      /* keep prior pins on transient failure */
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Events + members open to coffee near you
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant={showEvents ? "default" : "outline"}
          onClick={() => setShowEvents((v) => !v)}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Events ({data.events.length})
        </Button>
        <Button
          size="sm"
          variant={showPeople ? "default" : "outline"}
          onClick={() => setShowPeople((v) => !v)}
        >
          <Coffee className="w-4 h-4 mr-2" />
          Coffee ({data.people.length})
        </Button>
      </div>

      <div className="relative h-[55vh] md:h-[640px] rounded-lg overflow-hidden border">
        <MapContainer
          center={[39.5, -98.35]}
          zoom={4}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <BoundsWatcher onChange={loadFor} />

          {showEvents &&
            data.events.map((e) => (
              <Marker key={`e-${e.id}`} position={[e.lat, e.lng]} icon={eventIcon}>
                <Popup>
                  <div className="space-y-1 min-w-[180px]">
                    <div className="text-xs text-blue-700">
                      {new Date(e.startAt).toLocaleString()}
                    </div>
                    <div className="font-semibold">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.attendeeCount} going
                      {e.capacity ? ` / ${e.capacity}` : ""}
                      {" · "}
                      {e.eventFormat.replace("_", "-")}
                    </div>
                    <Link
                      to={`/events/${e.slug ?? e.id}`}
                      className="text-blue-600 text-sm hover:underline"
                    >
                      View event →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}

          {showPeople &&
            data.people.map((p) => (
              <Marker key={`p-${p.id}`} position={[p.lat, p.lng]} icon={personIcon}>
                <Popup>
                  <div className="space-y-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      {p.avatarUrl && (
                        <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                      )}
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        {p.headline && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {p.headline}
                          </div>
                        )}
                      </div>
                    </div>
                    <Link
                      to={`/people/${p.id}`}
                      className="text-amber-700 text-sm hover:underline"
                    >
                      View profile →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      </div>
    </div>
  );
}

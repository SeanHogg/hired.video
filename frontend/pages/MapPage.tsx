/**
 * /map — discovery map.
 *
 * Two pin layers:
 *   • Public upcoming events (calendar icon, blue)
 *   • Members open to coffee (coffee icon, amber)
 *
 * Bounds-driven: refetches `/api/map?minLat=…` whenever the user pans
 * or zooms. Click on a pin opens a small popup with title + link to
 * the relevant detail surface.
 *
 * The owner-only detail drawer pattern from
 * [project_globe_details_owner_only] kicks in once the popup links to
 * the entity detail page (PeopleDetail / EventDetail) — both already
 * route through `useEntityDetailsPermission` for the deep view.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Coffee, Calendar, MapPin } from "lucide-react";
import { apiClient } from "@/lib/api-client";

// Leaflet ships its default marker icons via image URLs that Webpack/Vite
// rewrite incorrectly. Pin the icon URLs to the public CDN copies so they
// resolve regardless of the bundler's asset graph.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Colored variants for the two pin kinds.
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

export default function MapPage() {
  useSEO("/map");
  useBreadcrumbs([{ name: "Map", url: "/map" }]);

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
      if (seq !== fetchSeq.current) return; // stale
      setData(res.data ?? { events: [], people: [] });
    } catch {
      /* keep prior pins on transient failure */
    }
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-600" />
            Map
          </h1>
          <span className="text-sm text-muted-foreground hidden sm:inline">
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
      </div>

      <div className="relative h-[55vh] md:h-[calc(100vh-64px-56px)] md:max-h-[820px]">
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
    </AppShell>
  );
}

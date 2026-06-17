/**
 * <LocationFilter /> — viewer-side geo filter for search pages.
 *
 * Same shape as the picker's single-row variant but reads from the URL
 * search params and writes back to them — so navigation keeps the filter
 * state, and the same filter shape (LocationFilter) goes straight to the
 * unified /api/search/public endpoint (and to /api/jobs/public + the
 * recruiter POST body).
 *
 * Per the DRY rule: every search page imports this — never re-roll the
 * geo controls in a page-local Filters drawer.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  locationsService,
  type GeocodeHit,
  type LocationFilter as LocationFilterValue,
} from "@/lib/services/locations-service";

export interface LocationFilterProps {
  value: LocationFilterValue;
  onChange: (next: LocationFilterValue) => void;
  /** Show the radius slider/input. Defaults to false — most search pages
   *  only need city-level matching, and radius needs lat/lng to mean
   *  anything. */
  showRadius?: boolean;
  /** Compact horizontal layout for header filter bars. Defaults to
   *  stacked vertical (drawer-style). */
  compact?: boolean;
  /** Show the "Remote only" toggle. Defaults to true. Off for surfaces where
   *  remote is meaningless (Companies, Resumes) so the control isn't shown
   *  where it can't filter anything (#1177). */
  showRemote?: boolean;
}

export function LocationFilter({
  value,
  onChange,
  showRadius = false,
  compact = false,
  showRemote = true,
}: LocationFilterProps) {
  const [text, setText] = useState(value.text ?? "");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setText(value.text ?? "");
  }, [value.text]);

  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      // Propagate freeform text even when the user never picks an autocomplete
      // hit, so string-match endpoints (companies, articles) still receive
      // `?location=` without geocoder coverage (#1176). The server prefers
      // structured ids when present and falls back to ilike on this text.
      if (q !== (value.text ?? "")) {
        onChange({ ...value, text: q });
      }
      setSearching(true);
      try {
        const results = await locationsService.search(q);
        setHits(results);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = useCallback(
    (hit: GeocodeHit) => {
      onChange({
        ...value,
        countryId: hit.countryId ?? null,
        stateId: hit.stateId ?? null,
        cityId: hit.cityId ?? null,
        latitude: hit.latitude ?? null,
        longitude: hit.longitude ?? null,
        text: hit.label,
      });
      setText(hit.label);
      setOpen(false);
    },
    [value, onChange],
  );

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const hit = await locationsService.reverse(pos.coords.latitude, pos.coords.longitude);
      if (hit) accept(hit);
    });
  }, [accept]);

  const clear = useCallback(() => {
    setText("");
    onChange({});
  }, [onChange]);

  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-3"}>
      <div className={compact ? "relative w-64" : "relative"}>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="City, state, or country"
          className="text-sm"
        />
        {open && hits.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
            {hits.map((h) => (
              <li
                key={`${h.label}-${h.cityId ?? h.stateId ?? h.countryId}`}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(h);
                }}
              >
                {h.label}
                <span className="ml-2 text-xs text-muted-foreground">{h.placeType}</span>
              </li>
            ))}
          </ul>
        )}
        {searching && (
          <span className="absolute right-2 top-2 text-xs text-muted-foreground">…</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={useMyLocation}>
          Use my location
        </Button>
        {(value.text || value.cityId || value.stateId || value.countryId || value.remote !== undefined) && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {showRemote && (
        <div className="flex items-center gap-2">
          <Switch
            checked={value.remote === true}
            onCheckedChange={(v) => onChange({ ...value, remote: v ? true : undefined })}
          />
          <Label className="text-sm">Remote only</Label>
        </div>
      )}

      {showRadius && value.latitude != null && value.longitude != null && (
        <div className="flex items-center gap-2">
          <Label className="text-sm">Within</Label>
          <Input
            type="number"
            min={1}
            max={500}
            value={value.radiusKm ?? ""}
            onChange={(e) =>
              onChange({ ...value, radiusKm: e.target.value ? Number(e.target.value) : null })
            }
            className="w-24 text-sm"
            placeholder="km"
          />
        </div>
      )}
    </div>
  );
}

/** Helper — read a LocationFilter from URLSearchParams. */
export function locationFilterFromQuery(qs: URLSearchParams): LocationFilterValue {
  const num = (k: string) => {
    const v = qs.get(k);
    return v ? Number(v) : undefined;
  };
  const str = (k: string) => qs.get(k) ?? undefined;
  const remoteRaw = qs.get("remote") ?? qs.get("isRemote");
  return {
    countryId: num("countryId"),
    stateId: str("stateId"),
    cityId: str("cityId"),
    latitude: num("lat"),
    longitude: num("lng"),
    radiusKm: num("radiusKm"),
    remote: remoteRaw === "true" ? true : remoteRaw === "false" ? false : undefined,
    text: str("location"),
  };
}

/** Helper — write a LocationFilter into URLSearchParams (mutates). */
export function applyLocationFilterToQuery(
  qs: URLSearchParams,
  filter: LocationFilterValue,
): void {
  const setOrDelete = (k: string, v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined || v === "") qs.delete(k);
    else qs.set(k, String(v));
  };
  setOrDelete("countryId", filter.countryId);
  setOrDelete("stateId", filter.stateId);
  setOrDelete("cityId", filter.cityId);
  setOrDelete("lat", filter.latitude);
  setOrDelete("lng", filter.longitude);
  setOrDelete("radiusKm", filter.radiusKm);
  setOrDelete("isRemote", filter.remote);
  setOrDelete("location", filter.text);
}

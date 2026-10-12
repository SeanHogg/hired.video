/**
 * <LocationPicker /> — the single geo-input component used on every
 * create/edit form (jobs, articles, resumes, videos, services, voice
 * clones, templates, user profile home location).
 *
 * Supports:
 *  • Free-text autocomplete (Mapbox-backed when configured, seed-table
 *    fallback otherwise) that resolves to structured ids on selection.
 *  • Cascading country → state → city dropdowns for users who prefer to
 *    drill in.
 *  • Optional `isRemote` toggle.
 *  • Multi-region "audience served" rows in addition to the single
 *    origin row (only rendered when `multiRegion=true`).
 *
 * Per the DRY rule: this is the ONLY location input on the frontend.
 * Every entity form imports it; no per-entity geo widget should exist.
 *
 * Consumer pattern:
 *   const [locations, setLocations] = useState<ContentLocationSet>({
 *     origin: null, serves: [],
 *   });
 *   <LocationPicker value={locations} onChange={setLocations} multiRegion />
 *   // After the entity save succeeds:
 *   await locationsService.setForEntity(kind, id, locations);
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  locationsService,
  type ContentLocationInput,
  type ContentLocationSet,
  type CountryOption,
  type StateOption,
  type CityOption,
  type GeocodeHit,
} from "@/lib/services/locations-service";

export interface LocationPickerProps {
  value: ContentLocationSet;
  onChange: (next: ContentLocationSet) => void;
  /** True = render an "audience served" multi-row editor below origin. */
  multiRegion?: boolean;
  /** Hide the remote toggle when geo is intrinsically location-bound
   *  (e.g. an in-person service). Defaults to shown. */
  showRemote?: boolean;
  /** Override label on the primary section. Defaults to "Location". */
  originLabel?: string;
}

export function LocationPicker({
  value,
  onChange,
  multiRegion = false,
  showRemote = true,
  originLabel = "Location",
}: LocationPickerProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="mb-2 block text-sm font-medium">{originLabel}</Label>
        <SingleLocationRow
          value={value.origin ?? {}}
          onChange={(next) =>
            onChange({ ...value, origin: hasAnyField(next) ? next : null })
          }
          showRemote={showRemote}
          placeholder="Search city, state, or country…"
        />
      </div>

      {multiRegion && (
        <ServesEditor
          value={value.serves ?? []}
          onChange={(serves) => onChange({ ...value, serves })}
        />
      )}
    </div>
  );
}

// ─── One row: free-text autocomplete + cascading dropdowns + remote toggle ───
function SingleLocationRow({
  value,
  onChange,
  showRemote,
  placeholder,
  onRemove,
}: {
  value: Partial<ContentLocationInput>;
  onChange: (next: Partial<ContentLocationInput>) => void;
  showRemote: boolean;
  placeholder: string;
  onRemove?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [openAutocomplete, setOpenAutocomplete] = useState(false);

  // Debounced free-text autocomplete.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setHits([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await locationsService.search(q);
        setHits(results);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const acceptHit = (hit: GeocodeHit) => {
    onChange({
      ...value,
      countryId: hit.countryId ?? null,
      stateId: hit.stateId ?? null,
      cityId: hit.cityId ?? null,
      postalCode: hit.postalCode ?? null,
      latitude: hit.latitude ?? null,
      longitude: hit.longitude ?? null,
      label: hit.label,
    });
    setSearch(hit.label);
    setOpenAutocomplete(false);
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      <div className="relative">
        <Input
          value={search || value.label || ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpenAutocomplete(true);
          }}
          onFocus={() => setOpenAutocomplete(true)}
          placeholder={placeholder}
          className="text-sm"
        />
        {openAutocomplete && hits.length > 0 && (
          <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-md">
            {hits.map((h) => (
              <li
                key={`${h.label}-${h.cityId ?? h.stateId ?? h.countryId}`}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptHit(h);
                }}
              >
                <span className="font-medium">{h.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{h.placeType}</span>
              </li>
            ))}
          </ul>
        )}
        {searching && (
          <span className="absolute right-2 top-2 text-xs text-muted-foreground">…</span>
        )}
      </div>

      <CascadingDropdowns value={value} onChange={onChange} />

      <div className="flex items-center justify-between">
        {showRemote ? (
          <div className="flex items-center gap-2">
            <Switch
              checked={value.isRemote ?? false}
              onCheckedChange={(v) => onChange({ ...value, isRemote: v })}
            />
            <Label className="text-sm">Remote / Online</Label>
          </div>
        ) : (
          <span />
        )}
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

function CascadingDropdowns({
  value,
  onChange,
}: {
  value: Partial<ContentLocationInput>;
  onChange: (next: Partial<ContentLocationInput>) => void;
}) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  useEffect(() => {
    void locationsService.countries().then(setCountries);
  }, []);

  useEffect(() => {
    if (value.countryId) {
      void locationsService.states(value.countryId).then(setStates);
    } else {
      setStates([]);
    }
  }, [value.countryId]);

  useEffect(() => {
    if (value.stateId) {
      void locationsService.cities(value.stateId).then(setCities);
    } else {
      setCities([]);
    }
  }, [value.stateId]);

  const countryItems = useMemo(
    () =>
      countries.map((c) => (
        <SelectItem key={c.id} value={String(c.id)}>
          {c.name}
        </SelectItem>
      )),
    [countries],
  );
  const stateItems = useMemo(
    () =>
      states.map((s) => (
        <SelectItem key={s.id} value={s.id}>
          {s.name}
          {s.code ? ` (${s.code})` : ""}
        </SelectItem>
      )),
    [states],
  );
  const cityItems = useMemo(
    () =>
      cities.map((c) => (
        <SelectItem key={c.id} value={c.id}>
          {c.name}
        </SelectItem>
      )),
    [cities],
  );

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Select
        value={value.countryId ? String(value.countryId) : ""}
        onValueChange={(v) =>
          onChange({ ...value, countryId: v ? Number(v) : null, stateId: null, cityId: null })
        }
      >
        <SelectTrigger className="text-sm">
          <SelectValue placeholder="Country" />
        </SelectTrigger>
        <SelectContent>{countryItems}</SelectContent>
      </Select>

      <Select
        value={value.stateId ?? ""}
        onValueChange={(v) => onChange({ ...value, stateId: v || null, cityId: null })}
        disabled={!value.countryId || states.length === 0}
      >
        <SelectTrigger className="text-sm">
          <SelectValue placeholder="State / Region" />
        </SelectTrigger>
        <SelectContent>{stateItems}</SelectContent>
      </Select>

      <Select
        value={value.cityId ?? ""}
        onValueChange={(v) => onChange({ ...value, cityId: v || null })}
        disabled={!value.stateId || cities.length === 0}
      >
        <SelectTrigger className="text-sm">
          <SelectValue placeholder="City" />
        </SelectTrigger>
        <SelectContent>{cityItems}</SelectContent>
      </Select>
    </div>
  );
}

// ─── Multi-region "audience served" editor ──────────────────────────────
function ServesEditor({
  value,
  onChange,
}: {
  value: Partial<ContentLocationInput>[];
  onChange: (next: Partial<ContentLocationInput>[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="block text-sm font-medium">Audience served (optional)</Label>
      <p className="text-xs text-muted-foreground">
        Add regions you target in addition to your primary location. Viewers in any of these
        regions will see your content even if it differs from where you're based.
      </p>
      {value.map((row, i) => (
        <SingleLocationRow
          key={i}
          value={row}
          onChange={(next) => {
            const copy = [...value];
            copy[i] = next;
            onChange(copy);
          }}
          showRemote={false}
          placeholder="Add a target region…"
          onRemove={() => onChange(value.filter((_, j) => j !== i))}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...value, {}])}
      >
        + Add region
      </Button>
    </div>
  );
}

function hasAnyField(input: Partial<ContentLocationInput>): boolean {
  return Boolean(
    input.countryId ||
      input.stateId ||
      input.cityId ||
      input.postalCode ||
      input.latitude != null ||
      input.longitude != null ||
      input.label ||
      input.isRemote,
  );
}

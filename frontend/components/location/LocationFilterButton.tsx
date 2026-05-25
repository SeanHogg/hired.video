/**
 * <LocationFilterButton /> — compact action-bar entry to the shared
 * LocationFilter. Renders a "Location" button (MapPin icon + active count
 * pill) that opens a popover containing the full geo filter UI.
 *
 * Used in PageHeader.actions on Jobs / Resumes / People (and any future
 * search surface) so each page exposes the same filter affordance without
 * each one redeclaring the same Popover + LocationFilter pair.
 */

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LocationFilter } from "@/components/location/LocationFilter";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";

interface LocationFilterButtonProps {
  value: LocationFilterValue;
  onChange: (next: LocationFilterValue) => void;
}

/** Treat any structured id, geo coord, radius, free-text, or remote toggle
 *  as "filter active" — the dot/badge tells the user the popover holds
 *  something even when collapsed. */
function isActive(filter: LocationFilterValue): boolean {
  return Boolean(
    filter.text ||
      filter.cityId ||
      filter.stateId ||
      filter.countryId ||
      filter.latitude != null ||
      filter.longitude != null ||
      filter.radiusKm != null ||
      filter.remote !== undefined,
  );
}

export default function LocationFilterButton({
  value,
  onChange,
}: LocationFilterButtonProps) {
  const active = isActive(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          className="gap-2 min-h-[44px]"
          aria-label="Location filter"
        >
          <MapPin className="h-4 w-4" />
          Location
          {active && (
            <span className="ml-1 inline-block h-2 w-2 rounded-full bg-primary-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Location</h4>
          <LocationFilter value={value} onChange={onChange} compact={false} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

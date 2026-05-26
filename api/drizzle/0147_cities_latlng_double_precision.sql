-- #1596 — cities.latitude / longitude varchar(20) → double precision.
--
-- The whole project uses doublePrecision for lat/lng everywhere except
-- this one table, which predates the convention. Side effect today:
-- every "find cities within X km" query string-casts on read, no DB-side
-- validation that the stored string is even a valid number, and the
-- index space is wasted on string keys.
--
-- Conversion uses a NULL-tolerant cast — any row whose existing string
-- value doesn't parse as a number becomes NULL rather than failing the
-- migration. That matches the existing read-side semantics (the
-- LocationService treats NULL lat/lng as "no coordinate known").
--
-- Schema TS callsite ripple:
--   - LocationService.ensureGeocodedPlace was writing
--     `place.latitude.toString()` to satisfy the varchar column — that
--     `.toString()` is removed in the same pass.
--   - LocationService.lookupSeededByText + routes/locations.ts had
--     `cityLat: string | null` type assertions + `Number(r.cityLat)`
--     conversions; both become unnecessary after the column type change
--     and are simplified in the same pass.

ALTER TABLE cities
  ALTER COLUMN latitude  TYPE double precision
    USING CASE
      WHEN latitude ~ '^-?[0-9]+(\.[0-9]+)?$' THEN latitude::double precision
      ELSE NULL
    END,
  ALTER COLUMN longitude TYPE double precision
    USING CASE
      WHEN longitude ~ '^-?[0-9]+(\.[0-9]+)?$' THEN longitude::double precision
      ELSE NULL
    END;

-- postal_zip_codes shares the same anti-pattern (varchar(20) for what
-- should be doublePrecision). Same conversion in the same pass.
ALTER TABLE postal_zip_codes
  ALTER COLUMN latitude  TYPE double precision
    USING CASE
      WHEN latitude ~ '^-?[0-9]+(\.[0-9]+)?$' THEN latitude::double precision
      ELSE NULL
    END,
  ALTER COLUMN longitude TYPE double precision
    USING CASE
      WHEN longitude ~ '^-?[0-9]+(\.[0-9]+)?$' THEN longitude::double precision
      ELSE NULL
    END;

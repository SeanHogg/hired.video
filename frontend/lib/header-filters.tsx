// Header filter registry: lets pages declare a small JSON schema of advanced
// filters that the global header renders inside its Advanced popover. Filter
// values live in URL search params (single source of truth), so pages just
// read the URL for the values they registered.

import * as React from "react";
import { useSearchParams } from "react-router-dom";

export type FilterFieldType = "text" | "select" | "boolean" | "number-range";

export interface SelectOption {
  value: string;
  label: string;
}

export interface FilterField {
  /** URL search-param key. Must be unique within a page. */
  key: string;
  /** Human label shown above the control in the popover. */
  label: string;
  type: FilterFieldType;
  /** Required when type === "select". */
  options?: SelectOption[];
  /** Optional placeholder for text/number inputs. */
  placeholder?: string;
  /** For number-range, the param keys for min and max (default `${key}Min`/`${key}Max`). */
  rangeKeys?: { min: string; max: string };
}

interface HeaderFiltersContextValue {
  fields: FilterField[];
  register: (id: string, fields: FilterField[]) => void;
  unregister: (id: string) => void;
}

const HeaderFiltersContext = React.createContext<HeaderFiltersContextValue | null>(
  null,
);

export function HeaderFiltersProvider({ children }: { children: React.ReactNode }) {
  // Map of registration id → fields. Allows multiple components to coexist;
  // last-registered wins per duplicate key.
  const [registry, setRegistry] = React.useState<Record<string, FilterField[]>>({});

  const register = React.useCallback((id: string, fields: FilterField[]) => {
    setRegistry((prev) => {
      const existing = prev[id];
      if (existing && JSON.stringify(existing) === JSON.stringify(fields)) {
        return prev;
      }
      return { ...prev, [id]: fields };
    });
  }, []);

  const unregister = React.useCallback((id: string) => {
    setRegistry((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const fields = React.useMemo(() => {
    const merged: FilterField[] = [];
    const seen = new Set<string>();
    for (const list of Object.values(registry)) {
      for (const f of list) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        merged.push(f);
      }
    }
    return merged;
  }, [registry]);

  const value = React.useMemo(
    () => ({ fields, register, unregister }),
    [fields, register, unregister],
  );

  return (
    <HeaderFiltersContext.Provider value={value}>
      {children}
    </HeaderFiltersContext.Provider>
  );
}

export function useHeaderFiltersRegistry(): HeaderFiltersContextValue {
  const ctx = React.useContext(HeaderFiltersContext);
  if (!ctx) {
    // Provider missing — return a no-op so dev/test renders don't crash.
    return {
      fields: [],
      register: () => {},
      unregister: () => {},
    };
  }
  return ctx;
}

/**
 * Register a set of advanced filter fields with the header. Returns the
 * current values for those fields, read from URL search params.
 *
 * The URL is the single source of truth: pages read the returned values
 * (and update their queries / filtered lists accordingly), and the header's
 * Advanced popover writes new values back to the URL.
 */
export function useHeaderFilters(
  fields: FilterField[],
): Record<string, string | undefined> {
  const { register, unregister } = useHeaderFiltersRegistry();
  const id = React.useId();
  const [searchParams] = useSearchParams();

  // Stringify-based dependency so callers can pass inline arrays without
  // re-registering on every render.
  const fieldsKey = React.useMemo(() => JSON.stringify(fields), [fields]);

  React.useEffect(() => {
    register(id, fields);
    return () => unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fieldsKey, register, unregister]);

  return React.useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const f of fields) {
      if (f.type === "number-range") {
        const minKey = f.rangeKeys?.min ?? `${f.key}Min`;
        const maxKey = f.rangeKeys?.max ?? `${f.key}Max`;
        out[minKey] = searchParams.get(minKey) ?? undefined;
        out[maxKey] = searchParams.get(maxKey) ?? undefined;
      } else {
        out[f.key] = searchParams.get(f.key) ?? undefined;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, searchParams]);
}

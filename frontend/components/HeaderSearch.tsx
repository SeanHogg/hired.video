import {
  Search,
  SlidersHorizontal,
  Filter,
  Users,
  Building2,
  FileText,
  Briefcase,
  Sparkles,
  Check,
  Wrench,
  HelpCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  useHeaderFiltersRegistry,
  type FilterField,
} from "@/lib/header-filters";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LocationFilter,
  locationFilterFromQuery,
  applyLocationFilterToQuery,
} from "@/components/location/LocationFilter";
import type { LocationFilter as LocationFilterValue } from "@/lib/services/locations-service";
import { cn } from "@/lib/utils";

export type HeaderSearchContext =
  | "all"
  | "people"
  | "companies"
  | "resumes"
  | "jobs"
  | "tools"
  | "help";

type ContextOption = {
  value: HeaderSearchContext;
  label: string;
  icon: typeof Sparkles;
  path: string;
  placeholder: string;
  /** Extra query params merged into every navigate. Used to pin a category
   * when the context funnels into the unified /search page. */
  defaultParams?: Record<string, string>;
};

const CONTEXT_OPTIONS: ContextOption[] = [
  {
    value: "all",
    label: "All",
    icon: Sparkles,
    path: "/search",
    placeholder: "Search everything — people, jobs, resumes, companies...",
  },
  {
    value: "people",
    label: "People",
    icon: Users,
    path: "/people",
    placeholder: "Search professionals by name, role, or skills...",
  },
  {
    value: "companies",
    label: "Companies",
    icon: Building2,
    path: "/companies",
    placeholder: "Search companies, industries, or locations...",
  },
  {
    value: "resumes",
    label: "Resumes",
    icon: FileText,
    path: "/resumes",
    placeholder: "Search resumes by name, title, or skills...",
  },
  {
    value: "jobs",
    label: "Jobs",
    icon: Briefcase,
    path: "/jobs",
    placeholder: "Search jobs, companies, or skills...",
  },
  {
    value: "tools",
    label: "Tools",
    icon: Wrench,
    path: "/search",
    placeholder: "Search AI career tools (resume, salary, interview...)",
    defaultParams: { category: "tools" },
  },
  {
    value: "help",
    label: "Help & Docs",
    icon: HelpCircle,
    path: "/search",
    placeholder: "Search help topics, features, or questions...",
    defaultParams: { category: "guides" },
  },
];

function contextFromPath(pathname: string): HeaderSearchContext {
  const p = pathname.toLowerCase();
  if (p.startsWith("/people")) return "people";
  if (p.startsWith("/companies")) return "companies";
  if (p.startsWith("/resumes")) return "resumes";
  if (p.startsWith("/jobs")) return "jobs";
  if (p.startsWith("/tools")) return "tools";
  if (p.startsWith("/help") || p.startsWith("/guides") || p.startsWith("/blog"))
    return "help";
  // /search and everything else: unified everything-search.
  return "all";
}

function rangeKeysFor(field: FilterField): { min: string; max: string } {
  return field.rangeKeys ?? { min: `${field.key}Min`, max: `${field.key}Max` };
}

export default function HeaderSearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { fields: registeredFields } = useHeaderFiltersRegistry();

  const derivedContext = contextFromPath(location.pathname);
  const [overrideContext, setOverrideContext] = useState<HeaderSearchContext | null>(null);
  const context = overrideContext ?? derivedContext;

  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  // Structured geo filter — same component used on Jobs.tsx / UnifiedSearch so
  // typeahead, "Use my location", and Remote toggle are available everywhere
  // search is exposed. Seeded from URL when the popover opens; written back
  // on Apply so deep-links share filter state.
  const [geoFilter, setGeoFilter] = useState<LocationFilterValue>(() =>
    locationFilterFromQuery(searchParams),
  );
  const [datePosted, setDatePosted] = useState("all");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Keep the input in sync with the URL so deep-links / back-nav show the
  // active query rather than an empty box.
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Seed local form state from the URL whenever the popover opens, so it
  // reflects the canonical filter values rather than stale local state.
  useEffect(() => {
    if (!advancedOpen) return;
    setGeoFilter(locationFilterFromQuery(searchParams));
    setDatePosted(searchParams.get("datePosted") ?? "all");
    const next: Record<string, string> = {};
    for (const f of registeredFields) {
      if (f.type === "number-range") {
        const { min, max } = rangeKeysFor(f);
        next[min] = searchParams.get(min) ?? "";
        next[max] = searchParams.get(max) ?? "";
      } else {
        next[f.key] = searchParams.get(f.key) ?? "";
      }
    }
    setExtraValues(next);
  }, [advancedOpen, registeredFields, searchParams]);

  const current = useMemo(
    () => CONTEXT_OPTIONS.find((o) => o.value === context) ?? CONTEXT_OPTIONS[0],
    [context],
  );
  const CurrentIcon = current.icon;

  const submit = (overrides?: {
    geo?: LocationFilterValue;
    datePosted?: string;
    extras?: Record<string, string>;
  }) => {
    const params = new URLSearchParams();
    // Same-path submit — preserve the active sub-tab so typing in the
    // header from `/resumes?tab=available` doesn't kick the user back to
    // `?tab=mine`. Cross-path submits stay clean (no stale state leaks).
    if (current.path === location.pathname) {
      const tab = searchParams.get("tab");
      if (tab) params.set("tab", tab);
    }
    // Context-pinned params (e.g. category=tools) go first so explicit
    // overrides from the advanced panel can still replace them.
    for (const [key, value] of Object.entries(current.defaultParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (query.trim()) params.set("q", query.trim());
    applyLocationFilterToQuery(params, overrides?.geo ?? geoFilter);
    const dp = overrides?.datePosted ?? datePosted;
    if (dp && dp !== "all") params.set("datePosted", dp);
    const extras = overrides?.extras ?? extraValues;
    for (const [key, value] of Object.entries(extras)) {
      const trimmed = (value ?? "").trim();
      if (!trimmed || trimmed === "all") continue;
      params.set(key, trimmed);
    }
    const qs = params.toString();
    navigate(qs ? `${current.path}?${qs}` : current.path);
  };

  const handleContextSelect = (value: HeaderSearchContext) => {
    setOverrideContext(value);
  };

  const applyAdvanced = () => {
    setAdvancedOpen(false);
    submit();
  };

  const clearAdvanced = () => {
    setGeoFilter({});
    setDatePosted("all");
    setExtraValues({});
  };

  const setExtra = (key: string, value: string) => {
    setExtraValues((prev) => ({ ...prev, [key]: value }));
  };

  const renderField = (field: FilterField) => {
    if (field.type === "select") {
      const value = extraValues[field.key] || "all";
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {field.label}
          </label>
          <Select
            value={value}
            onValueChange={(v) => setExtra(field.key, v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === "boolean") {
      const value = extraValues[field.key] || "all";
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {field.label}
          </label>
          <Select
            value={value}
            onValueChange={(v) => setExtra(field.key, v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );
    }
    if (field.type === "number-range") {
      const { min, max } = rangeKeysFor(field);
      return (
        <div key={field.key} className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            {field.label}
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={extraValues[min] ?? ""}
              onChange={(e) => setExtra(min, e.target.value)}
              placeholder="Min"
              className="h-8 text-sm"
            />
            <Input
              type="number"
              value={extraValues[max] ?? ""}
              onChange={(e) => setExtra(max, e.target.value)}
              placeholder="Max"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }
    // text
    return (
      <div key={field.key} className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {field.label}
        </label>
        <Input
          value={extraValues[field.key] ?? ""}
          onChange={(e) => setExtra(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="h-8 text-sm"
        />
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1.5 w-full">
      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={current.placeholder}
            className="pl-9 pr-24 lg:pr-36 xl:pr-52 h-9"
            aria-label="Search"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-xs font-medium"
                  aria-label="Search type"
                  title={`Searching: ${current.label}`}
                >
                  <CurrentIcon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{current.label}</span>
                  <Filter className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {CONTEXT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = opt.value === context;
                  return (
                    <DropdownMenuItem
                      key={opt.value}
                      onSelect={() => handleContextSelect(opt.value)}
                      className={cn("gap-2", selected && "font-medium")}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{opt.label}</span>
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="w-px h-4 bg-border mx-0.5 hidden md:block" />
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1 text-xs font-medium hidden md:inline-flex"
                aria-label="Advanced search options"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">Advanced</span>
              </Button>
            </PopoverTrigger>
          </div>
        </div>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Advanced search</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearAdvanced}
              >
                Clear
              </Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Location
              </label>
              <LocationFilter
                value={geoFilter}
                onChange={setGeoFilter}
                compact={false}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Date posted
              </label>
              <Select value={datePosted} onValueChange={setDatePosted}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any time</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="3d">Last 3 days</SelectItem>
                  <SelectItem value="week">Last week</SelectItem>
                  <SelectItem value="month">Last month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {registeredFields.length > 0 && (
              <>
                <div className="border-t border-border -mx-4" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  {current.label} filters
                </p>
                {registeredFields.map(renderField)}
              </>
            )}
            <Button size="sm" className="w-full" onClick={applyAdvanced}>
              Apply &amp; search
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

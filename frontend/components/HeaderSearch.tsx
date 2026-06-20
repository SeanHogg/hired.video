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
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { trackUsageEvent } from "@/lib/usage-tracker";
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
  /** i18n key resolved at render (this array is module-level, before any
   *  hook is available). Reuses existing `labels.*` where one fits. */
  labelKey: string;
  icon: typeof Sparkles;
  path: string;
  placeholderKey: string;
  /** Extra query params merged into every navigate. Used to pin a category
   * when the context funnels into the unified /search page. */
  defaultParams?: Record<string, string>;
};

const CONTEXT_OPTIONS: ContextOption[] = [
  {
    value: "all",
    labelKey: "search.context.all",
    icon: Sparkles,
    path: "/search",
    placeholderKey: "search.placeholder.all",
  },
  {
    value: "people",
    labelKey: "labels.people",
    icon: Users,
    path: "/people",
    placeholderKey: "search.placeholder.people",
  },
  {
    value: "companies",
    labelKey: "labels.companies",
    icon: Building2,
    path: "/companies",
    placeholderKey: "search.placeholder.companies",
  },
  {
    value: "resumes",
    labelKey: "labels.resumes",
    icon: FileText,
    path: "/resumes",
    placeholderKey: "search.placeholder.resumes",
  },
  {
    value: "jobs",
    labelKey: "labels.jobs",
    icon: Briefcase,
    path: "/jobs",
    placeholderKey: "search.placeholder.jobs",
  },
  {
    value: "tools",
    labelKey: "search.context.tools",
    icon: Wrench,
    path: "/search",
    placeholderKey: "search.placeholder.tools",
    defaultParams: { category: "tools" },
  },
  {
    value: "help",
    labelKey: "search.context.help",
    icon: HelpCircle,
    path: "/search",
    placeholderKey: "search.placeholder.help",
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

export interface HeaderSearchProps {
  /** Fired on every keystroke with the live query. Lets a host page use the
   *  one global search box as a live filter for its own sections (Studio
   *  landing) without a second search input. Enter still navigates to the
   *  context's search page as usual. Absent → header search behaves as the
   *  pure global-nav search it is everywhere else. */
  onQueryChange?: (query: string) => void;
}

export default function HeaderSearch({ onQueryChange }: HeaderSearchProps = {}) {
  const { t } = useTranslation();
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
  // Mobile-only: the docked input is replaced by a compact search icon
  // that expands into a full-width top overlay on tap (the header had no
  // room for the input + context chip + right-hand controls on a phone).
  const [mobileOpen, setMobileOpen] = useState(false);

  // Keep the input in sync with the URL so deep-links / back-nav show the
  // active query rather than an empty box.
  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  // Collapse the mobile search overlay whenever the route changes (a
  // submit navigates, but so can a context pick that deep-links elsewhere).
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

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
    // Usage tracking (#2044) — a search is a high-intent signal for the
    // presence/engagement surface. Self-gates on consent.
    if (query.trim()) {
      trackUsageEvent("search", {
        path: current.path,
        payload: { query: query.trim(), context: current.path },
      });
    }
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
              <SelectItem value="all">{t("labels.any")}</SelectItem>
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
              <SelectItem value="all">{t("labels.any")}</SelectItem>
              <SelectItem value="true">{t("search.yes")}</SelectItem>
              <SelectItem value="false">{t("search.no")}</SelectItem>
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
              placeholder={t("search.min")}
              className="h-8 text-sm"
            />
            <Input
              type="number"
              value={extraValues[max] ?? ""}
              onChange={(e) => setExtra(max, e.target.value)}
              placeholder={t("search.max")}
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

  // Context-picker dropdown — identical in the desktop docked input and
  // the mobile overlay, so it's built once here and rendered in both
  // (returns fresh JSX per call; both hosts can coexist in the DOM).
  const renderContextDropdown = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1 text-xs font-medium"
          aria-label={t("search.searchType")}
          title={t("search.searchingLabel", { label: t(current.labelKey) })}
        >
          <CurrentIcon className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t(current.labelKey)}</span>
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
              <span className="flex-1">{t(opt.labelKey)}</span>
              {selected && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Shared input wiring (value + live onChange) reused by both inputs so
  // the global-query state stays the single source of truth.
  const queryInputBase = {
    value: query,
    placeholder: t(current.placeholderKey),
    "aria-label": t("search.ariaSearch"),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      onQueryChange?.(e.target.value);
    },
  };

  return (
    <>
      {/* Mobile (< md): a compact search icon that expands into a top
       *  overlay. Keeps the phone header uncluttered (icon only) while the
       *  full input + context picker live in the expanded sheet. */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden h-9 w-9 shrink-0"
        onClick={() => setMobileOpen(true)}
        aria-label={t("search.ariaSearch")}
      >
        <Search className="h-5 w-5" />
      </Button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 inset-x-0 flex items-center gap-2 h-16 px-3 bg-background border-b border-border">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                {...queryInputBase}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    submit();
                    setMobileOpen(false);
                  } else if (e.key === "Escape") {
                    setMobileOpen(false);
                  }
                }}
                className="pl-9 pr-24 h-10"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                {renderContextDropdown()}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => setMobileOpen(false)}
              aria-label={t("actions.close")}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Desktop (md+): the docked input with the advanced-filters popover. */}
      <div className="hidden md:flex items-center gap-1.5 w-full">
      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            {...queryInputBase}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            className="pl-9 pr-24 lg:pr-36 xl:pr-52 h-9"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {renderContextDropdown()}
            <div className="w-px h-4 bg-border mx-0.5 hidden md:block" />
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 gap-1 text-xs font-medium hidden md:inline-flex"
                aria-label={t("search.advancedOptions")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{t("search.advanced")}</span>
              </Button>
            </PopoverTrigger>
          </div>
        </div>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t("search.advancedSearch")}</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearAdvanced}
              >
                {t("actions.clear")}
              </Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("labels.location")}
              </label>
              <LocationFilter
                value={geoFilter}
                onChange={setGeoFilter}
                compact={false}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("search.datePosted")}
              </label>
              <Select value={datePosted} onValueChange={setDatePosted}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("search.anyTime")}</SelectItem>
                  <SelectItem value="24h">{t("search.last24h")}</SelectItem>
                  <SelectItem value="3d">{t("search.last3d")}</SelectItem>
                  <SelectItem value="week">{t("search.lastWeek")}</SelectItem>
                  <SelectItem value="month">{t("search.lastMonth")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {registeredFields.length > 0 && (
              <>
                <div className="border-t border-border -mx-4" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                  {t("search.contextFilters", { label: t(current.labelKey) })}
                </p>
                {registeredFields.map(renderField)}
              </>
            )}
            <Button size="sm" className="w-full" onClick={applyAdvanced}>
              {t("search.applyAndSearch")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      </div>
    </>
  );
}

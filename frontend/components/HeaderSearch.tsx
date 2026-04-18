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
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { SearchContext } from "@/components/SearchBar";
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
import { cn } from "@/lib/utils";

type ContextOption = {
  value: SearchContext;
  label: string;
  icon: typeof Sparkles;
  path: string;
  placeholder: string;
};

const CONTEXT_OPTIONS: ContextOption[] = [
  {
    value: "all",
    label: "All",
    icon: Sparkles,
    path: "/",
    placeholder: "Search videos, professions, companies...",
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
];

function contextFromPath(pathname: string): SearchContext {
  if (pathname.startsWith("/people")) return "people";
  if (pathname.startsWith("/companies")) return "companies";
  if (pathname.startsWith("/resumes")) return "resumes";
  if (pathname.startsWith("/jobs")) return "jobs";
  return "all";
}

export default function HeaderSearch() {
  const location = useLocation();
  const navigate = useNavigate();

  const derivedContext = contextFromPath(location.pathname);
  const [overrideContext, setOverrideContext] = useState<SearchContext | null>(null);
  const context = overrideContext ?? derivedContext;

  const [query, setQuery] = useState("");
  const [location_, setLocation_] = useState("");
  const [datePosted, setDatePosted] = useState("all");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const current = useMemo(
    () => CONTEXT_OPTIONS.find((o) => o.value === context) ?? CONTEXT_OPTIONS[0],
    [context],
  );
  const CurrentIcon = current.icon;

  const submit = (overrides?: { location?: string; datePosted?: string }) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const loc = overrides?.location ?? location_;
    if (loc.trim()) params.set("location", loc.trim());
    const dp = overrides?.datePosted ?? datePosted;
    if (dp && dp !== "all") params.set("datePosted", dp);
    const qs = params.toString();
    navigate(qs ? `${current.path}?${qs}` : current.path);
  };

  const handleContextSelect = (value: SearchContext) => {
    setOverrideContext(value);
  };

  const applyAdvanced = () => {
    setAdvancedOpen(false);
    submit();
  };

  const clearAdvanced = () => {
    setLocation_("");
    setDatePosted("all");
  };

  return (
    <div className="flex items-center gap-1.5 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={current.placeholder}
          className="pl-9 pr-24 h-9"
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
        </div>
      </div>

      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 flex-shrink-0 hidden md:inline-flex"
            aria-label="Advanced search options"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Advanced</span>
          </Button>
        </PopoverTrigger>
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
              <Input
                value={location_}
                onChange={(e) => setLocation_(e.target.value)}
                placeholder="City, state, or remote"
                className="h-8 text-sm"
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
            <Button size="sm" className="w-full" onClick={applyAdvanced}>
              Apply & search
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

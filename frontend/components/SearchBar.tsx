import {
  Search,
  Filter,
  ChevronDown,
  SlidersHorizontal,
  MapPin,
  Briefcase,
  GraduationCap,
  Calendar,
  Users,
  Building2,
  FileText,
  Clock,
  Sparkles,
  TrendingUp,
  Grid,
  List,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMPANY_SIZE_OPTIONS } from "@/lib/constants/company-constants";
import { INDUSTRIES } from "@/lib/constants/industries";

export type SearchContext = "people" | "companies" | "resumes" | "jobs" | "all";

export interface SearchFilters {
  // Common filters
  search?: string;
  location?: string;

  // People filters
  role?: string;
  skills?: string;
  openToWork?: boolean;
  experienceLevel?: string;

  // Company filters
  industry?: string;
  size?: string;

  // Resume filters
  privacy?: string;
  isMaster?: boolean;

  // Job filters
  employmentType?: string;
  /** #2092 — onsite / remote / hybrid work-setting facet. */
  workSetting?: string;
  remote?: boolean;
  salaryMin?: number;
  salaryMax?: number;

  // Advanced filters
  searchRadius?: string;
  education?: string;
  datePosted?: string;
  hasMedia?: boolean;
  sortBy?: "recent" | "featured" | "top" | "latest";
}

export interface SearchBarProps {
  context: SearchContext;
  placeholder?: string;
  value?: string;
  filters?: SearchFilters;
  showAdvanced?: boolean;
  className?: string;
  onSearch?: (_query: string) => void;
  onFilterChange?: (_filters: SearchFilters) => void;
  onClearFilters?: () => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (_mode: "grid" | "list") => void;
  /**
   * When true, hides the Filters / Advanced buttons and the filter panels
   * (the header's Advanced popover renders the fields instead). View-mode
   * toggle still renders.
   */
  hideFilters?: boolean;
}

// Icon + filter-section layout per context. Placeholder copy lives in the
// i18n catalogue under `search.bar.placeholder.<context>` so each locale
// can rephrase it idiomatically; the heading label lives under
// `search.bar.contextHeading.<context>`.
const contextConfig = {
  people: {
    icon: Users,
    filterSections: [
      "role",
      "location",
      "skills",
      "availability",
      "experience",
    ],
  },
  companies: {
    icon: Building2,
    filterSections: ["industry", "size", "location"],
  },
  resumes: {
    icon: FileText,
    filterSections: ["privacy", "type", "experience", "skills"],
  },
  jobs: {
    icon: Briefcase,
    filterSections: [
      "location",
      "employmentType",
      "experience",
      "remote",
      "salary",
    ],
  },
  all: {
    icon: Search,
    filterSections: ["location", "experience", "education", "datePosted", "media"],
  },
};

export default function SearchBar({
  context,
  placeholder,
  value = "",
  filters = {},
  showAdvanced = false,
  className = "",
  onSearch,
  onFilterChange,
  onClearFilters,
  viewMode,
  onViewModeChange,
  hideFilters = false,
}: SearchBarProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState(value);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(showAdvanced);

  const config = contextConfig[context];
  const IconComponent = config.icon;

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    onSearch?.(query);
  };

  const handleFilterChange = (
    key: string,
    value: string | number | boolean | undefined,
  ) => {
    const newFilters = { ...filters, [key]: value };
    onFilterChange?.(newFilters);
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setShowFilters(false);
    setShowAdvancedFilters(false);
    onClearFilters?.();
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).filter(
      (value) => value !== undefined && value !== "" && value !== null,
    ).length;
  };

  const renderFilterSection = (section: string) => {
    switch (section) {
      case "role":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("labels.role")}</label>
            <Select
              value={filters.role || "all"}
              onValueChange={(value) =>
                handleFilterChange("role", value === "all" ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.roles")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.roles")}</SelectItem>
                <SelectItem value="job_seeker">{t("labels.jobSeekers")}</SelectItem>
                <SelectItem value="recruiter">{t("labels.recruiters")}</SelectItem>
                <SelectItem value="employer">{t("labels.employers")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "industry":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("fields.industry.label")}</label>
            <Select
              value={filters.industry || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "industry",
                  value === "all" ? undefined : value,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.industries")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.industries")}</SelectItem>
                {INDUSTRIES.map((industry) => (
                  <SelectItem key={industry} value={industry}>
                    {industry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "size":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t("search.bar.companySize")}
            </label>
            <Select
              value={filters.size || "all"}
              onValueChange={(value) =>
                handleFilterChange("size", value === "all" ? undefined : value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.sizes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.sizes")}</SelectItem>
                {COMPANY_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case "location":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("fields.location.label")}</label>
            <Input
              placeholder={t("search.bar.placeholder.cityState")}
              value={filters.location || ""}
              onChange={(e) => handleFilterChange("location", e.target.value)}
            />
          </div>
        );

      case "skills":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("fields.skills.label")}</label>
            <Input
              placeholder={t("search.bar.placeholder.skillsExample")}
              value={filters.skills || ""}
              onChange={(e) => handleFilterChange("skills", e.target.value)}
            />
          </div>
        );

      case "availability":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t("search.bar.availability")}
            </label>
            <Select
              value={filters.openToWork?.toString() || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "openToWork",
                  value === "all" ? undefined : value === "true",
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.professionals")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.professionals")}</SelectItem>
                <SelectItem value="true">{t("search.bar.availability.openToWork")}</SelectItem>
                <SelectItem value="false">{t("search.bar.availability.notLooking")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "experience":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              {t("search.bar.experienceLevel")}
            </label>
            <Select
              value={filters.experienceLevel || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "experienceLevel",
                  value === "all" ? undefined : value,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.levels")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.levels")}</SelectItem>
                <SelectItem value="entry">{t("labels.experienceLevel.entry")}</SelectItem>
                <SelectItem value="mid">{t("labels.experienceLevel.mid")}</SelectItem>
                <SelectItem value="senior">{t("labels.experienceLevel.senior")}</SelectItem>
                <SelectItem value="executive">{t("labels.experienceLevel.executive")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "privacy":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("headings.privacy")}</label>
            <Select
              value={filters.privacy || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "privacy",
                  value === "all" ? undefined : value,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.privacyLevels")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.privacyLevels")}</SelectItem>
                <SelectItem value="private">{t("labels.privacy.private")}</SelectItem>
                <SelectItem value="recruiter_only">{t("labels.privacy.recruiterOnly")}</SelectItem>
                <SelectItem value="public">{t("labels.privacy.public")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "type":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("labels.transactionType")}</label>
            <Select
              value={
                filters.isMaster === undefined
                  ? "all"
                  : filters.isMaster
                    ? "master"
                    : "variation"
              }
              onValueChange={(value) =>
                handleFilterChange(
                  "isMaster",
                  value === "all" ? undefined : value === "master",
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.types")}</SelectItem>
                <SelectItem value="master">{t("labels.master")}</SelectItem>
                <SelectItem value="variation">{t("search.bar.resumeType.variation")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "employmentType":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">
              {t("search.bar.employmentType")}
            </label>
            <Select
              value={filters.employmentType || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "employmentType",
                  value === "all" ? undefined : value,
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.types")}</SelectItem>
                <SelectItem value="full-time">{t("labels.employmentType.fullTime")}</SelectItem>
                <SelectItem value="part-time">{t("labels.employmentType.partTime")}</SelectItem>
                <SelectItem value="contract">{t("labels.employmentType.contract")}</SelectItem>
                <SelectItem value="internship">{t("labels.employmentType.internship")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "remote":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("labels.remote")}</label>
            <Select
              value={filters.remote?.toString() || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "remote",
                  value === "all" ? undefined : value === "true",
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.locations")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.locations")}</SelectItem>
                <SelectItem value="true">{t("search.bar.remoteOnly")}</SelectItem>
                <SelectItem value="false">{t("search.bar.onsiteOnly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case "salary":
        return (
          <div className="col-span-2">
            <label className="text-sm font-medium mb-2 block">
              {t("search.bar.salaryRange")}
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder={t("search.bar.placeholder.minSalary")}
                value={filters.salaryMin || ""}
                onChange={(e) =>
                  handleFilterChange(
                    "salaryMin",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
              />
              <Input
                type="number"
                placeholder={t("search.bar.placeholder.maxSalary")}
                value={filters.salaryMax || ""}
                onChange={(e) =>
                  handleFilterChange(
                    "salaryMax",
                    e.target.value ? parseInt(e.target.value) : undefined,
                  )
                }
              />
            </div>
          </div>
        );

      case "media":
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">{t("search.bar.media")}</label>
            <Select
              value={filters.hasMedia?.toString() || "all"}
              onValueChange={(value) =>
                handleFilterChange(
                  "hasMedia",
                  value === "all" ? undefined : value === "true",
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t("search.bar.all.content")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("search.bar.all.content")}</SelectItem>
                <SelectItem value="true">{t("search.bar.media.withVideosImages")}</SelectItem>
                <SelectItem value="false">{t("search.bar.media.textOnly")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Search Bar */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={placeholder || t(`search.bar.placeholder.${context}`)}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 min-h-[44px]"
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {!hideFilters && context !== "all" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2 min-h-[44px]"
            >
              <Filter className="w-4 h-4" />
              {t("studio.sidebar.filters")}
              {getActiveFilterCount() > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs min-w-[1.25rem] h-5 flex items-center justify-center">
                  {getActiveFilterCount()}
                </span>
              )}
            </Button>
          )}

          {!hideFilters && context === "all" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="gap-2 min-h-[44px]"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {t("marketing.pricing.value.advanced")}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showAdvancedFilters ? "rotate-180" : ""}`}
              />
            </Button>
          )}

          {viewMode && onViewModeChange && (
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => onViewModeChange("grid")}
                className="rounded-r-none min-h-[44px]"
                aria-label={t("actions.gridView")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => onViewModeChange("list")}
                className="rounded-l-none min-h-[44px]"
                aria-label={t("actions.listView")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Basic Filters Panel */}
      {!hideFilters && showFilters && context !== "all" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconComponent className="w-4 h-4" />
                {t("search.bar.filtersHeading", {
                  context: t(`search.bar.contextHeading.${context}`),
                })}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs"
              >
                {t("actions.clearAll")}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {config.filterSections.map((section) => (
                <div key={section}>{renderFilterSection(section)}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Filters Panel (for homepage) */}
      {!hideFilters && showAdvancedFilters && context === "all" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">
                {t("search.bar.advancedFilters")}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs"
              >
                {t("actions.clearAll")}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search Radius */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {t("search.bar.searchRadius")}
                </label>
                <Select
                  value={filters.searchRadius || "25"}
                  onValueChange={(value) =>
                    handleFilterChange("searchRadius", value)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">{t("search.bar.radius.miles", { count: 5 })}</SelectItem>
                    <SelectItem value="10">{t("search.bar.radius.miles", { count: 10 })}</SelectItem>
                    <SelectItem value="25">{t("search.bar.radius.miles", { count: 25 })}</SelectItem>
                    <SelectItem value="50">{t("search.bar.radius.miles", { count: 50 })}</SelectItem>
                    <SelectItem value="100">{t("search.bar.radius.miles", { count: 100 })}</SelectItem>
                    <SelectItem value="remote">{t("search.bar.radius.remote")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Experience Level */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {t("search.bar.experienceLevel")}
                </label>
                <Select
                  value={filters.experienceLevel || "all"}
                  onValueChange={(value) =>
                    handleFilterChange(
                      "experienceLevel",
                      value === "all" ? undefined : value,
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("search.bar.all.levels")}</SelectItem>
                    <SelectItem value="entry">{t("labels.experienceLevel.entry")}</SelectItem>
                    <SelectItem value="mid">{t("labels.experienceLevel.mid")}</SelectItem>
                    <SelectItem value="senior">{t("labels.experienceLevel.senior")}</SelectItem>
                    <SelectItem value="executive">{t("labels.experienceLevel.executive")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Education */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" />
                  {t("headings.education")}
                </label>
                <Select
                  value={filters.education || "all"}
                  onValueChange={(value) =>
                    handleFilterChange(
                      "education",
                      value === "all" ? undefined : value,
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("search.bar.all.education")}</SelectItem>
                    <SelectItem value="high-school">{t("search.bar.education.highSchool")}</SelectItem>
                    <SelectItem value="associate">{t("search.bar.education.associate")}</SelectItem>
                    <SelectItem value="bachelor">{t("search.bar.education.bachelor")}</SelectItem>
                    <SelectItem value="master">{t("search.bar.education.master")}</SelectItem>
                    <SelectItem value="phd">{t("search.bar.education.phd")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Posted */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {t("search.bar.datePosted")}
                </label>
                <Select
                  value={filters.datePosted || "all"}
                  onValueChange={(value) =>
                    handleFilterChange(
                      "datePosted",
                      value === "all" ? undefined : value,
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("search.bar.date.anyTime")}</SelectItem>
                    <SelectItem value="24h">{t("search.bar.date.last24h")}</SelectItem>
                    <SelectItem value="3d">{t("search.bar.date.last3d")}</SelectItem>
                    <SelectItem value="week">{t("search.bar.date.lastWeek")}</SelectItem>
                    <SelectItem value="month">{t("search.bar.date.lastMonth")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {t("search.bar.sortBy")}
                </label>
                <Select
                  value={filters.sortBy || "recent"}
                  onValueChange={(value) =>
                    handleFilterChange("sortBy", value as "recent" | "featured" | "top" | "latest")
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {t("search.bar.sort.recent")}
                      </div>
                    </SelectItem>
                    <SelectItem value="featured">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3" />
                        {t("search.bar.sort.featured")}
                      </div>
                    </SelectItem>
                    <SelectItem value="top">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" />
                        {t("search.bar.sort.top")}
                      </div>
                    </SelectItem>
                    <SelectItem value="latest">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3" />
                        {t("search.bar.sort.latest")}
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Media Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {t("search.bar.mediaContent")}
                </label>
                <Select
                  value={filters.hasMedia?.toString() || "all"}
                  onValueChange={(value) =>
                    handleFilterChange(
                      "hasMedia",
                      value === "all" ? undefined : value === "true",
                    )
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("search.bar.all.content")}</SelectItem>
                    <SelectItem value="true">{t("search.bar.media.withVideosImages")}</SelectItem>
                    <SelectItem value="false">{t("search.bar.media.textOnly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

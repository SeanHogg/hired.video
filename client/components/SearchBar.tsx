import {
  Search,
  Filter,
  X,
  ChevronDown,
  SlidersHorizontal,
  MapPin,
  Briefcase,
  GraduationCap,
  Calendar,
  Users,
  Building2,
  FileText,
  UserCheck
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type SearchContext = 'people' | 'companies' | 'resumes' | 'jobs' | 'all';

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
  remote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  
  // Advanced filters
  searchRadius?: string;
  education?: string;
  datePosted?: string;
}

export interface SearchBarProps {
  context: SearchContext;
  placeholder?: string;
  value?: string;
  filters?: SearchFilters;
  showAdvanced?: boolean;
  className?: string;
  onSearch?: (query: string) => void;
  onFilterChange?: (filters: SearchFilters) => void;
  onClearFilters?: () => void;
}

const contextConfig = {
  people: {
    placeholder: "Search professionals by name, role, or skills...",
    icon: Users,
    filterSections: ['role', 'location', 'skills', 'availability', 'experience']
  },
  companies: {
    placeholder: "Search companies, industries, or locations...",
    icon: Building2,
    filterSections: ['industry', 'size', 'location']
  },
  resumes: {
    placeholder: "Search resumes by name, title, or skills...",
    icon: FileText,
    filterSections: ['privacy', 'type', 'experience', 'skills']
  },
  jobs: {
    placeholder: "Search jobs, companies, or skills...",
    icon: Briefcase,
    filterSections: ['location', 'employmentType', 'experience', 'remote', 'salary']
  },
  all: {
    placeholder: "Search videos, professions, companies...",
    icon: Search,
    filterSections: ['location', 'experience', 'education', 'datePosted']
  }
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
  onClearFilters
}: SearchBarProps) {
  const [searchQuery, setSearchQuery] = useState(value);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(showAdvanced);
  
  const config = contextConfig[context];
  const IconComponent = config.icon;

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    onSearch?.(query);
  };

  const handleFilterChange = (key: string, value: any) => {
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
    return Object.values(filters).filter(value => 
      value !== undefined && value !== "" && value !== null
    ).length;
  };

  const renderFilterSection = (section: string) => {
    switch (section) {
      case 'role':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Role</label>
            <Select value={filters.role || "all"} onValueChange={(value) => handleFilterChange('role', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="job_seeker">Job Seekers</SelectItem>
                <SelectItem value="recruiter">Recruiters</SelectItem>
                <SelectItem value="business">Business Leaders</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'industry':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Industry</label>
            <Select value={filters.industry || "all"} onValueChange={(value) => handleFilterChange('industry', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                <SelectItem value="Technology">Technology</SelectItem>
                <SelectItem value="Marketing Technology">Marketing Technology</SelectItem>
                <SelectItem value="Cloud Infrastructure">Cloud Infrastructure</SelectItem>
                <SelectItem value="Web Development">Web Development</SelectItem>
                <SelectItem value="Venture Capital">Venture Capital</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'size':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Company Size</label>
            <Select value={filters.size || "all"} onValueChange={(value) => handleFilterChange('size', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All sizes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sizes</SelectItem>
                <SelectItem value="1-10">1-10 employees</SelectItem>
                <SelectItem value="10-50">10-50 employees</SelectItem>
                <SelectItem value="50-200">50-200 employees</SelectItem>
                <SelectItem value="200-500">200-500 employees</SelectItem>
                <SelectItem value="500+">500+ employees</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'location':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Location</label>
            <Input 
              placeholder="City, State"
              value={filters.location || ""}
              onChange={(e) => handleFilterChange('location', e.target.value)}
            />
          </div>
        );

      case 'skills':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Skills</label>
            <Input 
              placeholder="e.g. React, Python"
              value={filters.skills || ""}
              onChange={(e) => handleFilterChange('skills', e.target.value)}
            />
          </div>
        );

      case 'availability':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Availability</label>
            <Select value={filters.openToWork?.toString() || "all"} onValueChange={(value) => handleFilterChange('openToWork', value === 'all' ? undefined : value === "true")}>
              <SelectTrigger>
                <SelectValue placeholder="All professionals" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All professionals</SelectItem>
                <SelectItem value="true">Open to work</SelectItem>
                <SelectItem value="false">Not looking</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'experience':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              Experience Level
            </label>
            <Select value={filters.experienceLevel || "all"} onValueChange={(value) => handleFilterChange('experienceLevel', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="mid">Mid Level</SelectItem>
                <SelectItem value="senior">Senior Level</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'privacy':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Privacy</label>
            <Select value={filters.privacy || "all"} onValueChange={(value) => handleFilterChange('privacy', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All privacy levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All privacy levels</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="recruiter_only">Recruiter Only</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'type':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Type</label>
            <Select value={filters.isMaster === undefined ? "all" : filters.isMaster ? "master" : "variation"} onValueChange={(value) => handleFilterChange('isMaster', value === "all" ? undefined : value === "master")}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="master">Master</SelectItem>
                <SelectItem value="variation">Variation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'employmentType':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Employment Type</label>
            <Select value={filters.employmentType || "all"} onValueChange={(value) => handleFilterChange('employmentType', value === 'all' ? undefined : value)}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="full-time">Full-time</SelectItem>
                <SelectItem value="part-time">Part-time</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'remote':
        return (
          <div>
            <label className="text-sm font-medium mb-2 block">Remote</label>
            <Select value={filters.remote?.toString() || "all"} onValueChange={(value) => handleFilterChange('remote', value === 'all' ? undefined : value === "true")}>
              <SelectTrigger>
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                <SelectItem value="true">Remote only</SelectItem>
                <SelectItem value="false">On-site only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      case 'salary':
        return (
          <div className="col-span-2">
            <label className="text-sm font-medium mb-2 block">Salary Range</label>
            <div className="flex gap-2">
              <Input 
                type="number"
                placeholder="Min salary"
                value={filters.salaryMin || ""}
                onChange={(e) => handleFilterChange('salaryMin', e.target.value ? parseInt(e.target.value) : undefined)}
              />
              <Input 
                type="number"
                placeholder="Max salary"
                value={filters.salaryMax || ""}
                onChange={(e) => handleFilterChange('salaryMax', e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Main Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={placeholder || config.placeholder}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex gap-2">
          {context !== 'all' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              Filters
              {getActiveFilterCount() > 0 && (
                <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-xs min-w-[1.25rem] h-5 flex items-center justify-center">
                  {getActiveFilterCount()}
                </span>
              )}
            </Button>
          )}

          {context === 'all' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className="gap-2"
            >
              <SlidersHorizontal className="w-4 h-4" />
              Advanced
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {/* Basic Filters Panel */}
      {showFilters && context !== 'all' && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <IconComponent className="w-4 h-4" />
                {context.charAt(0).toUpperCase() + context.slice(1)} Filters
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {config.filterSections.map((section) => (
                <div key={section}>
                  {renderFilterSection(section)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Filters Panel (for homepage) */}
      {showAdvancedFilters && context === 'all' && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Advanced Filters</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search Radius */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Search Radius
                </label>
                <Select value={filters.searchRadius || "25"} onValueChange={(value) => handleFilterChange('searchRadius', value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 miles</SelectItem>
                    <SelectItem value="10">10 miles</SelectItem>
                    <SelectItem value="25">25 miles</SelectItem>
                    <SelectItem value="50">50 miles</SelectItem>
                    <SelectItem value="100">100 miles</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Experience Level */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  Experience Level
                </label>
                <Select value={filters.experienceLevel || "all"} onValueChange={(value) => handleFilterChange('experienceLevel', value === 'all' ? undefined : value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="entry">Entry Level</SelectItem>
                    <SelectItem value="mid">Mid Level</SelectItem>
                    <SelectItem value="senior">Senior Level</SelectItem>
                    <SelectItem value="executive">Executive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Education */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" />
                  Education
                </label>
                <Select value={filters.education || "all"} onValueChange={(value) => handleFilterChange('education', value === 'all' ? undefined : value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Education</SelectItem>
                    <SelectItem value="high-school">High School</SelectItem>
                    <SelectItem value="associate">Associate Degree</SelectItem>
                    <SelectItem value="bachelor">Bachelor's Degree</SelectItem>
                    <SelectItem value="master">Master's Degree</SelectItem>
                    <SelectItem value="phd">PhD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date Posted */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Date Posted
                </label>
                <Select value={filters.datePosted || "all"} onValueChange={(value) => handleFilterChange('datePosted', value === 'all' ? undefined : value)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Time</SelectItem>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="3d">Last 3 days</SelectItem>
                    <SelectItem value="week">Last week</SelectItem>
                    <SelectItem value="month">Last month</SelectItem>
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

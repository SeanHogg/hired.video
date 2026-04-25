import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  MapPin,
  DollarSign,
  Users,
  Briefcase,
  ExternalLink,
  Search,
  Building2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth";
import { jobService } from "@/lib/services/job-service";
import MarkdownPreview from "@/components/MarkdownPreview";
import { companyService } from "@/lib/services/company-service";

// Job interface matching backend structure
interface CompanyJob {
  id: string;
  title: string;
  description: string;
  summary?: string;
  responsibilities?: string[];
  requirements?: string[];
  employmentType?: string;
  experienceLevel?: string;
  location?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  workSetting?: "Onsite" | "Remote" | "Hybrid";
  status: "Draft" | "Open" | "Closed" | "Hired";
  createdAt: string;
  expiresAt?: string;
  applications: number;
  views: number;
  slug?: string;
  atsApplyUrl?: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  logo?: string;
  tagline?: string;
  description?: string;
  website?: string;
  industry?: string;
  size?: string;
  location?: string;
}

interface CompanyCareersControlProps {
  companyId?: string;
  companySlug?: string;
  showCompanyHeader?: boolean;
  showFilters?: boolean;
  showSearch?: boolean;
  maxJobs?: number;
  viewMode?: "table" | "cards";
  onJobClick?: (job: CompanyJob) => void;
  onApplyClick?: (job: CompanyJob) => void;
  className?: string;
}

export function CompanyCareersControl({
  companyId,
  companySlug,
  showCompanyHeader = true,
  showFilters = true,
  showSearch = true,
  maxJobs,
  viewMode = "table",
  onJobClick,
  onApplyClick,
  className = "",
}: CompanyCareersControlProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [employmentTypeFilter, setEmploymentTypeFilter] =
    useState<string>("all");
  const [experienceLevelFilter, setExperienceLevelFilter] =
    useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const { user, isAuthenticated } = useAuth();

  // Fetch company (by id or slug) using React Query with caching
  const companyQuery = useQuery({
    queryKey: ["company", companyId ?? companySlug ?? "hired-video-company"],
    queryFn: async (): Promise<CompanyInfo> => {
      try {
        if (companyId) {
          const c = await companyService.getCompanyById(companyId);
          return {
            id: c.id || companyId,
            name: c.name || "Company",
            logo: c.logo || "/logo.png",
            tagline: c.tagline || "",
            description: c.description ?? "",
            website: c.website ?? "",
            industry: c.industry || "",
            size: c.size || "",
            location: c.location || "",
          };
        } else if (companySlug) {
          const c = await companyService.getCompanyBySlug(companySlug);
          return {
            id: c.id || companySlug,
            name: c.name || "Company",
            logo: c.logo || "/logo.png",
            tagline: c.tagline || "",
            description: c.description ?? "",
            website: c.website ?? "",
            industry: c.industry || "",
            size: c.size || "",
            location: c.location || "",
          };
        }
      } catch (e) {
        // swallow to use fallback
      }
      // Fallback to hired.video if no company data loaded
      return {
        id: companyId || companySlug || "hired-video-company",
        name: "hired.video",
        logo: "/logo.png",
        tagline:
          "Revolutionizing the way people find and showcase their talents",
        description:
          "hired.video is a cutting-edge platform that combines traditional resumes with video presentations, helping job seekers stand out and employers find the perfect candidates.",
        website: "https://hired.video",
        industry: "Technology",
        size: "11-50",
        location: "San Francisco, CA",
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch jobs using React Query, keyed by company id (from query data)
  const jobsQuery = useQuery({
    enabled: !!companyQuery.data?.id,
    queryKey: [
      "company-jobs",
      (companyQuery.data?.id) ?? (companyId || companySlug || "hired-video-company"),
      maxJobs ?? null,
    ],
    queryFn: async (): Promise<CompanyJob[]> => {
      const cId = companyQuery.data?.id || companyId || companySlug || "hired-video-company";
      const jobsResponse = await jobService.getPublicJobs({
        companyId: cId,
        limit: maxJobs || 50,
      });

      const items = jobsResponse.items ?? [];
      return items.map((job) => ({
        id: job.id,
        title: job.title,
        description: job.title,
        summary: job.title,
        responsibilities: [],
        requirements: [],
        employmentType: job.employmentType,
        experienceLevel: "mid",
        location: job.location,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        currency: "USD",
        workSetting: job.isRemote ? "Remote" : "Onsite",
        status: "Open",
        createdAt: job.postedDate ?? new Date().toISOString(),
        applications: 0,
        views: 0,
        slug: job.id,
        atsApplyUrl: undefined,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const loading = companyQuery.isLoading || jobsQuery.isLoading;
  const error = (companyQuery.error || jobsQuery.error) ? "Failed to load jobs. Please try again later." : null;
  const company = companyQuery.data ?? null;
  const jobs = (jobsQuery.data ?? []);



  // Filter jobs based on search and filters
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      !searchTerm ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesEmploymentType =
      employmentTypeFilter === "all" ||
      job.employmentType === employmentTypeFilter;

    const matchesExperienceLevel =
      experienceLevelFilter === "all" ||
      job.experienceLevel === experienceLevelFilter;

    const matchesLocation =
      locationFilter === "all" ||
      job.location?.toLowerCase().includes(locationFilter.toLowerCase()) ||
      job.workSetting?.toLowerCase() === locationFilter.toLowerCase();

    return (
      matchesSearch &&
      matchesEmploymentType &&
      matchesExperienceLevel &&
      matchesLocation
    );
  });

  const handleJobClick = (job: CompanyJob) => {
    if (onJobClick) {
      onJobClick(job);
    } else {
      // Default behavior - navigate to job detail page
      window.open(`/jobs/${job.slug || job.id}`, "_blank");
    }
  };

  const handleApplyClick = (job: CompanyJob, e: React.MouseEvent) => {
    e.stopPropagation();

    if (onApplyClick) {
      onApplyClick(job);
    } else if (job.atsApplyUrl) {
      window.open(job.atsApplyUrl, "_blank");
    } else {
      // Default behavior - navigate to application page
      window.open(`/jobs/${job.slug || job.id}/apply`, "_blank");
    }
  };

  const formatSalary = (min?: number, max?: number, currency = "USD") => {
    if (!min && !max) return null;

    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

    if (min && max) {
      return `${formatter.format(min)} - ${formatter.format(max)}`;
    }
    return formatter.format(min || max || 0);
  };

  const getEmploymentTypeColor = (type?: string) => {
    switch (type) {
      case "full-time":
        return "bg-green-100 text-green-800";
      case "part-time":
        return "bg-blue-100 text-blue-800";
      case "contract":
        return "bg-purple-100 text-purple-800";
      case "internship":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getExperienceLevelColor = (level?: string) => {
    switch (level) {
      case "entry":
        return "bg-green-100 text-green-800";
      case "mid":
        return "bg-blue-100 text-blue-800";
      case "senior":
        return "bg-purple-100 text-purple-800";
      case "executive":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse">
          {showCompanyHeader && (
            <div className="h-32 bg-gray-200 rounded-lg mb-6" />
          )}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleRetry = () => {
    void companyQuery.refetch();
    void jobsQuery.refetch();
  };

  if (error) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={handleRetry} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Company Header */}
      {showCompanyHeader && company && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              {company.logo && (
                <img
                  src={company.logo}
                  alt={`${company.name} logo`}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold">{company.name}</h1>
                  {company.website && (
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={company.website}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
                {company.tagline && (
                  <p className="text-lg text-muted-foreground mb-3">
                    {company.tagline}
                  </p>
                )}
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {company.industry && (
                    <div className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {company.industry}
                    </div>
                  )}
                  {company.size && (
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {company.size} employees
                    </div>
                  )}
                  {company.location && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      {company.location}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      {(showSearch || showFilters) && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              {showSearch && (
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search jobs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}

              {showFilters && (
                <div className="flex gap-2">
                  <Select
                    value={employmentTypeFilter}
                    onValueChange={setEmploymentTypeFilter}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Job Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="full-time">Full-time</SelectItem>
                      <SelectItem value="part-time">Part-time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={experienceLevelFilter}
                    onValueChange={setExperienceLevelFilter}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Experience" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior Level</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={locationFilter}
                    onValueChange={setLocationFilter}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Location" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Locations</SelectItem>
                      <SelectItem value="remote">Remote</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="onsite">Onsite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobs Display */}
      {filteredJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No jobs found</h3>
              <p className="text-muted-foreground">
                {searchTerm ||
                employmentTypeFilter !== "all" ||
                experienceLevelFilter !== "all" ||
                locationFilter !== "all"
                  ? "Try adjusting your search criteria"
                  : "No open positions at this time. Check back later!"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "table" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Open Positions ({filteredJobs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Experience</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleJobClick(job)}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.title}</div>
                        <MarkdownPreview clamp={1} className="text-muted-foreground">
                          {job.summary || job.description}
                        </MarkdownPreview>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getEmploymentTypeColor(job.employmentType)}
                      >
                        {job.employmentType?.replace("-", " ") || "Full-time"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getExperienceLevelColor(job.experienceLevel)}
                      >
                        {job.experienceLevel || "Mid"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.workSetting === "Remote"
                          ? "Remote"
                          : job.location || "Not specified"}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatSalary(
                        job.salaryMin,
                        job.salaryMax,
                        job.currency,
                      ) || "Competitive"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(job.createdAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={(e) => handleApplyClick(job, e)}
                      >
                        Apply
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleJobClick(job)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">{job.title}</CardTitle>
                  <div className="flex gap-1">
                    <Badge
                      className={getEmploymentTypeColor(job.employmentType)}
                    >
                      {job.employmentType?.replace("-", " ") || "Full-time"}
                    </Badge>
                  </div>
                </div>
                <MarkdownPreview clamp={2} className="text-muted-foreground">
                  {job.summary || job.description}
                </MarkdownPreview>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.workSetting === "Remote"
                        ? "Remote"
                        : job.location || "Not specified"}
                    </div>
                    <Badge
                      className={getExperienceLevelColor(job.experienceLevel)}
                    >
                      {job.experienceLevel || "Mid"}
                    </Badge>
                  </div>

                  {(job.salaryMin || job.salaryMax) && (
                    <div className="flex items-center gap-1 text-sm">
                      <DollarSign className="h-3 w-3" />
                      {formatSalary(job.salaryMin, job.salaryMax, job.currency)}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-muted-foreground">
                      Posted {new Date(job.createdAt).toLocaleDateString()}
                    </div>
                    <Button size="sm" onClick={(e) => handleApplyClick(job, e)}>
                      Apply
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

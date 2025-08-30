import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Clock,
  DollarSign,
  Users,
  Briefcase,
  ExternalLink,
  Search,
  Filter,
  Calendar,
  Building2,
  ChevronRight,
  Star,
  Heart,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/lib/auth';
import { jobService } from '@/lib/services/job-service';
import { companyService } from '@/lib/services/company-service';

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
  workSetting?: 'Onsite' | 'Remote' | 'Hybrid';
  status: 'Draft' | 'Open' | 'Closed' | 'Hired';
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
  viewMode?: 'table' | 'cards';
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
  viewMode = 'table',
  onJobClick,
  onApplyClick,
  className = ''
}: CompanyCareersControlProps) {
  const [jobs, setJobs] = useState<CompanyJob[]>([]);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('all');
  const [experienceLevelFilter, setExperienceLevelFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    loadCompanyAndJobs();
  }, [companyId, companySlug]);

  const loadCompanyAndJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load company data if companyId is provided
      let companyData: CompanyInfo | null = null;

      if (companyId) {
        try {
          const companyResponse = await companyService.getCompanyById(companyId);
          companyData = {
            id: companyResponse.id,
            name: companyResponse.data.name,
            logo: companyResponse.data.logo,
            tagline: companyResponse.data.tagline,
            description: companyResponse.data.description,
            website: companyResponse.data.website,
            industry: companyResponse.data.industry,
            size: companyResponse.data.size,
            location: companyResponse.data.headquarters?.city ?
              `${companyResponse.data.headquarters.city}, ${companyResponse.data.headquarters.state}, ${companyResponse.data.headquarters.country}` :
              undefined
          };
        } catch (err) {
          console.warn('Failed to load company data, using fallback');
        }
      }

      // Fallback to MyVideoResu.me company data
      if (!companyData) {
        companyData = {
          id: companyId || 'myvideoresume-company',
          name: 'MyVideoResu.me',
          logo: '/logo.png',
          tagline: 'Revolutionizing the way people find and showcase their talents',
          description: 'MyVideoResu.me is a cutting-edge platform that combines traditional resumes with video presentations, helping job seekers stand out and employers find the perfect candidates.',
          website: 'https://myvideoresume.com',
          industry: 'Technology',
          size: '11-50',
          location: 'San Francisco, CA'
        };
      }

      // Load jobs data
      let jobsData: CompanyJob[] = [];

      try {
        const jobsResponse = await jobService.getPublicJobs({
          company: companyData.name,
          limit: maxJobs || 50
        });

        jobsData = jobsResponse.items.map(job => ({
          id: job.id,
          title: job.title,
          description: job.description,
          summary: job.summary,
          responsibilities: job.responsibilities,
          requirements: job.requirements,
          employmentType: job.employmentType,
          experienceLevel: job.experienceLevel,
          location: job.location,
          salaryMin: job.salaryMin,
          salaryMax: job.salaryMax,
          currency: job.currency || 'USD',
          workSetting: job.workSetting,
          status: job.status,
          createdAt: job.creationDateTimeFormatted || job.createdAt,
          applications: job.applications,
          views: job.views,
          slug: job.slug,
          atsApplyUrl: job.atsApplyUrl
        }));
      } catch (err) {
        console.warn('Failed to load jobs from API, using fallback data');

        // Fallback mock jobs for MyVideoResu.me
        jobsData = [
          {
            id: '1',
            title: 'Senior Full Stack Developer',
            description: 'Join our team to build the next generation of video resume technology. You\'ll work with React, Node.js, and cutting-edge AI technologies.',
            summary: 'Build innovative video resume platform features',
            responsibilities: [
              'Develop and maintain frontend applications using React and TypeScript',
              'Build scalable backend services with Node.js and C#',
              'Collaborate with AI team to integrate machine learning features',
              'Optimize application performance and user experience'
            ],
            requirements: [
              '5+ years of full-stack development experience',
              'Expert knowledge of React, TypeScript, and Node.js',
              'Experience with cloud platforms (Azure/AWS)',
              'Strong problem-solving and communication skills'
            ],
            employmentType: 'full-time',
            experienceLevel: 'senior',
            location: 'San Francisco, CA',
            salaryMin: 120000,
            salaryMax: 180000,
            currency: 'USD',
            workSetting: 'Hybrid',
            status: 'Open',
            createdAt: '2024-01-15',
            applications: 23,
            views: 156,
            slug: 'senior-full-stack-developer'
          },
          {
            id: '2',
            title: 'Product Designer',
            description: 'Shape the user experience of our video resume platform. Create intuitive designs that help users showcase their talents effectively.',
            summary: 'Design user-centric video resume experiences',
            responsibilities: [
              'Design user interfaces for web and mobile applications',
              'Conduct user research and usability testing',
              'Create wireframes, prototypes, and design systems',
              'Collaborate with engineering and product teams'
            ],
            requirements: [
              '3+ years of product design experience',
              'Proficiency in Figma, Sketch, or similar tools',
              'Strong portfolio demonstrating UX/UI skills',
              'Experience with design systems and accessibility'
            ],
            employmentType: 'full-time',
            experienceLevel: 'mid',
            location: 'San Francisco, CA',
            salaryMin: 90000,
            salaryMax: 130000,
            currency: 'USD',
            workSetting: 'Remote',
            status: 'Open',
            createdAt: '2024-01-10',
            applications: 18,
            views: 89,
            slug: 'product-designer'
          },
          {
            id: '3',
            title: 'DevOps Engineer',
            description: 'Build and maintain our cloud infrastructure. Ensure our platform scales reliably to serve millions of users worldwide.',
            summary: 'Scale infrastructure for global video platform',
            responsibilities: [
              'Manage cloud infrastructure on Azure and AWS',
              'Implement CI/CD pipelines and automation',
              'Monitor system performance and reliability',
              'Ensure security and compliance standards'
            ],
            requirements: [
              '4+ years of DevOps/Infrastructure experience',
              'Experience with Kubernetes, Docker, and Terraform',
              'Knowledge of monitoring tools (Prometheus, Grafana)',
              'Strong scripting skills (Python, Bash)'
            ],
            employmentType: 'full-time',
            experienceLevel: 'senior',
            location: 'Remote',
            salaryMin: 110000,
            salaryMax: 160000,
            currency: 'USD',
            workSetting: 'Remote',
            status: 'Open',
            createdAt: '2024-01-08',
            applications: 31,
            views: 124,
            slug: 'devops-engineer'
          }
        ];
      }

      setCompany(companyData);
      setJobs(maxJobs ? jobsData.slice(0, maxJobs) : jobsData);
    } catch (err) {
      setError('Failed to load jobs. Please try again later.');
      console.error('Error loading company jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter jobs based on search and filters
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = !searchTerm || 
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesEmploymentType = employmentTypeFilter === 'all' || 
      job.employmentType === employmentTypeFilter;
    
    const matchesExperienceLevel = experienceLevelFilter === 'all' || 
      job.experienceLevel === experienceLevelFilter;
    
    const matchesLocation = locationFilter === 'all' || 
      job.location?.toLowerCase().includes(locationFilter.toLowerCase()) ||
      job.workSetting?.toLowerCase() === locationFilter.toLowerCase();

    return matchesSearch && matchesEmploymentType && matchesExperienceLevel && matchesLocation;
  });

  const handleJobClick = (job: CompanyJob) => {
    if (onJobClick) {
      onJobClick(job);
    } else {
      // Default behavior - navigate to job detail page
      window.open(`/jobs/${job.slug || job.id}`, '_blank');
    }
  };

  const handleApplyClick = (job: CompanyJob, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (onApplyClick) {
      onApplyClick(job);
    } else if (job.atsApplyUrl) {
      window.open(job.atsApplyUrl, '_blank');
    } else {
      // Default behavior - navigate to application page
      window.open(`/jobs/${job.slug || job.id}/apply`, '_blank');
    }
  };

  const formatSalary = (min?: number, max?: number, currency = 'USD') => {
    if (!min && !max) return null;
    
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
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
      case 'full-time': return 'bg-green-100 text-green-800';
      case 'part-time': return 'bg-blue-100 text-blue-800';
      case 'contract': return 'bg-purple-100 text-purple-800';
      case 'internship': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getExperienceLevelColor = (level?: string) => {
    switch (level) {
      case 'entry': return 'bg-green-100 text-green-800';
      case 'mid': return 'bg-blue-100 text-blue-800';
      case 'senior': return 'bg-purple-100 text-purple-800';
      case 'executive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse">
          {showCompanyHeader && (
            <div className="h-32 bg-gray-200 rounded-lg mb-6"></div>
          )}
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="text-red-600 mb-4">{error}</div>
        <Button onClick={loadCompanyAndJobs} variant="outline">
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
                      <a href={company.website} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
                {company.tagline && (
                  <p className="text-lg text-muted-foreground mb-3">{company.tagline}</p>
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
                  <Select value={employmentTypeFilter} onValueChange={setEmploymentTypeFilter}>
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

                  <Select value={experienceLevelFilter} onValueChange={setExperienceLevelFilter}>
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

                  <Select value={locationFilter} onValueChange={setLocationFilter}>
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
                {searchTerm || employmentTypeFilter !== 'all' || experienceLevelFilter !== 'all' || locationFilter !== 'all'
                  ? 'Try adjusting your search criteria'
                  : 'No open positions at this time. Check back later!'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
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
                        <div className="text-sm text-muted-foreground line-clamp-1">
                          {job.summary || job.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getEmploymentTypeColor(job.employmentType)}>
                        {job.employmentType?.replace('-', ' ') || 'Full-time'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getExperienceLevelColor(job.experienceLevel)}>
                        {job.experienceLevel || 'Mid'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.workSetting === 'Remote' ? 'Remote' : job.location || 'Not specified'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatSalary(job.salaryMin, job.salaryMax, job.currency) || 'Competitive'}
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
                    <Badge className={getEmploymentTypeColor(job.employmentType)}>
                      {job.employmentType?.replace('-', ' ') || 'Full-time'}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="line-clamp-2">
                  {job.summary || job.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {job.workSetting === 'Remote' ? 'Remote' : job.location || 'Not specified'}
                    </div>
                    <Badge className={getExperienceLevelColor(job.experienceLevel)}>
                      {job.experienceLevel || 'Mid'}
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
                    <Button 
                      size="sm"
                      onClick={(e) => handleApplyClick(job, e)}
                    >
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

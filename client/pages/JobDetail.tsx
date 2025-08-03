import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import Navigation from '@/components/Navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import LoginModal from '@/components/LoginModal';
import { useAuth } from '@/lib/auth';
import { generateFakeJobData } from '@/lib/fakeData';
import { useSidebar } from '@/hooks/use-sidebar';
import { getJobById, addTrackedJob, removeTrackedJob, isJobTrackedByUser } from '@/data/mockJobs';
import {
  MapPin,
  DollarSign,
  Clock,
  Building2,
  Globe,
  Mail,
  Play,
  Edit,
  Share,
  Bookmark,
  BookmarkCheck,
  Users,
  Eye,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Briefcase,
  GraduationCap,
  Award,
  CheckCircle,
  ArrowLeft
} from 'lucide-react';

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({
    responsibilities: true,
    requirements: true,
    qualifications: false,
    benefits: false
  });

  const job = id ? getJobById(id) : null;
  const isOwner = user && job && job.userId === user.id;
  const isTracked = user && job ? isJobTrackedByUser(job.id, user.id) : false;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleTrackJob = () => {
    if (user && job) {
      if (isTracked) {
        removeTrackedJob(job.id, user.id);
      } else {
        addTrackedJob(job.id, user.id);
      }
      // In a real app, you'd trigger a re-render here
    }
  };

  if (!job) {
    return (
      <div className="min-h-screen bg-background">
        <Sidebar 
          isOpen={sidebarOpen} 
          onClose={closeSidebar} 
          collapsed={sidebarCollapsed}
        />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation 
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
              <p className="text-muted-foreground mb-6">The job you're looking for doesn't exist or has been removed.</p>
              <Button asChild>
                <Link to="/jobs">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Jobs
                </Link>
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      case 'draft':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar} 
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation 
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        
        <div className="pt-16">
          <div className="max-w-6xl mx-auto p-6">
            {/* Back Button */}
            <div className="mb-6">
              <Button variant="outline" onClick={() => navigate('/jobs')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Jobs
              </Button>
            </div>

            {/* Job Header */}
            <div className="mb-8">
              <Card>
                <CardHeader className="pb-6">
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Company Logo */}
                    <div className="flex-shrink-0">
                      <Avatar className="w-24 h-24">
                        <AvatarImage src={job.data.company.logo} alt={job.data.company.name} />
                        <AvatarFallback className="text-2xl">
                          {job.data.company.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Job Info */}
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-2xl">{job.data.title}</CardTitle>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status}
                            </Badge>
                          </div>
                          <CardDescription className="flex items-center gap-2 text-lg">
                            <Building2 className="h-5 w-5" />
                            {job.data.company.name}
                          </CardDescription>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {isOwner ? (
                            <Button asChild>
                              <Link to={`/jobs/edit/${job.id}`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Job
                              </Link>
                            </Button>
                          ) : (
                            <>
                              <Button variant="outline" onClick={handleTrackJob}>
                                {isTracked ? (
                                  <>
                                    <BookmarkCheck className="h-4 w-4 mr-2" />
                                    Tracked
                                  </>
                                ) : (
                                  <>
                                    <Bookmark className="h-4 w-4 mr-2" />
                                    Track
                                  </>
                                )}
                              </Button>
                              <Button>
                                Apply Now
                                <ExternalLink className="h-4 w-4 ml-2" />
                              </Button>
                            </>
                          )}
                          <Button variant="outline" size="icon">
                            <Share className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Quick Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {job.data.location.remote 
                              ? 'Remote' 
                              : `${job.data.location.city}, ${job.data.location.state}`}
                          </span>
                        </div>
                        {job.data.salaryMin && job.data.salaryMax && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span>
                              ${(job.data.salaryMin / 1000).toFixed(0)}k - ${(job.data.salaryMax / 1000).toFixed(0)}k
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{job.data.employmentType}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <span className="capitalize">{job.data.experienceLevel} level</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 mt-4 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Eye className="h-4 w-4" />
                          {job.views} views
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="h-4 w-4" />
                          {job.applications} applications
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          Posted {new Date(job.createdAt).toLocaleDateString()}
                        </div>
                        {job.expiresAt && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            Expires {new Date(job.expiresAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Video Section */}
                {job.data.videoUrl && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Play className="h-5 w-5" />
                        Job Overview Video
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <Play className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                          <p className="text-muted-foreground">Video preview not available</p>
                          <Button variant="outline" className="mt-4">
                            Watch on External Player
                            <ExternalLink className="h-4 w-4 ml-2" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Job Description */}
                <Card>
                  <CardHeader>
                    <CardTitle>About This Role</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line">{job.data.description}</p>
                  </CardContent>
                </Card>

                {/* Responsibilities */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => toggleSection('responsibilities')}
                  >
                    <CardTitle className="flex items-center justify-between">
                      Key Responsibilities
                      {expandedSections.responsibilities ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  {expandedSections.responsibilities && (
                    <CardContent>
                      <ul className="space-y-2">
                        {job.data.responsibilities.map((responsibility, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                            <span>{responsibility}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  )}
                </Card>

                {/* Requirements */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => toggleSection('requirements')}
                  >
                    <CardTitle className="flex items-center justify-between">
                      Required Skills
                      {expandedSections.requirements ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  {expandedSections.requirements && (
                    <CardContent>
                      <div className="space-y-3">
                        {job.data.requirements.map((req, index) => (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Badge variant={req.required ? "default" : "outline"}>
                                {req.skill}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {req.level}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {req.required ? 'Required' : 'Nice to have'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>

                {/* Qualifications */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => toggleSection('qualifications')}
                  >
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5" />
                        Qualifications
                      </div>
                      {expandedSections.qualifications ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  {expandedSections.qualifications && (
                    <CardContent>
                      <ul className="space-y-2">
                        {job.data.qualifications.map((qualification, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                            <span>{qualification}</span>
                          </li>
                        ))}
                      </ul>
                      {job.data.education && (
                        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-blue-900 mb-1">Education</p>
                          <p className="text-sm text-blue-700">{job.data.education}</p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>

                {/* Benefits */}
                <Card>
                  <CardHeader 
                    className="cursor-pointer"
                    onClick={() => toggleSection('benefits')}
                  >
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Award className="h-5 w-5" />
                        Benefits & Perks
                      </div>
                      {expandedSections.benefits ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  {expandedSections.benefits && (
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {job.data.benefits.map((benefit, index) => (
                          <div key={index} className="p-3 border rounded-lg">
                            <h4 className="font-medium text-sm mb-1">{benefit.type}</h4>
                            <p className="text-sm text-muted-foreground">{benefit.description}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Company Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      About {job.data.company.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Avatar className="w-16 h-16 mb-3">
                        <AvatarImage src={job.data.company.logo} alt={job.data.company.name} />
                        <AvatarFallback className="text-lg">
                          {job.data.company.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="font-semibold mb-2">{job.data.company.name}</h3>
                      {job.data.company.description && (
                        <p className="text-sm text-muted-foreground mb-3">
                          {job.data.company.description}
                        </p>
                      )}
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-2 text-sm">
                      {job.data.company.industry && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Industry</span>
                          <span>{job.data.company.industry}</span>
                        </div>
                      )}
                      {job.data.company.size && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Company size</span>
                          <span>{job.data.company.size} employees</span>
                        </div>
                      )}
                      {job.data.company.website && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Website</span>
                          <a 
                            href={job.data.company.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline flex items-center gap-1"
                          >
                            <Globe className="h-3 w-3" />
                            Visit
                          </a>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Apply Section */}
                {!isOwner && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Ready to Apply?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Button className="w-full" size="lg">
                        Apply Now
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                      
                      {job.data.contactEmail && (
                        <div className="text-center">
                          <p className="text-sm text-muted-foreground mb-2">Or contact directly</p>
                          <Button variant="outline" size="sm" className="w-full">
                            <Mail className="h-4 w-4 mr-2" />
                            {job.data.contactEmail}
                          </Button>
                        </div>
                      )}
                      
                      <div className="text-xs text-muted-foreground text-center space-y-1">
                        <p>By applying, you agree to our terms of service.</p>
                        {job.data.applicationDeadline && (
                          <p className="text-red-600">
                            Application deadline: {new Date(job.data.applicationDeadline).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Job Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle>Job Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Views</span>
                      <span className="font-medium">{job.views}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Applications</span>
                      <span className="font-medium">{job.applications}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Posted</span>
                      <span className="font-medium">{new Date(job.createdAt).toLocaleDateString()}</span>
                    </div>
                    {job.expiresAt && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Expires</span>
                        <span className="font-medium">{new Date(job.expiresAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    </div>
  );
}

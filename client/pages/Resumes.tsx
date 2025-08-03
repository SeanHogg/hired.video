import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import ResumeUpload from "@/components/ResumeUpload";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeViewer from "@/components/ResumeViewer";
import ResumeCard from "@/components/ResumeCard";
import ActionsModal from "@/components/ActionsModal";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/hooks/use-sidebar";
import { Resume, ResumeMetadata, ResumePrivacy, CreateResumeRequest, UpdateResumeRequest, ResumeUploadResponse, ResumeSearchFilters, ResumeWithOwnership } from "@/types/resume";
import { MOCK_RESUME_METADATA, getResumesByUserId, generateResumeId, getAllResumesForUser, isResumeTrackedByUser, addTrackedResume, removeTrackedResume } from '@/data/mockResumes';
import {
  FileText,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Upload,
  Eye,
  BarChart3,
  Zap,
  CheckCircle2,
  Play,
  TrendingUp,
  Users,
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Copy,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
  Calendar,
  Globe,
  Lock,
  Target,
  Power
} from "lucide-react";

export default function Resumes() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { isAuthenticated, user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  // State management
  const [view, setView] = useState<'list' | 'upload' | 'builder' | 'viewer'>('list');
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<ResumeSearchFilters>({});
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());

  // Actions modal state
  const [actionsModal, setActionsModal] = useState<{
    isOpen: boolean;
    item: any | null;
  }>({
    isOpen: false,
    item: null,
  });

  // Get user's resumes from centralized mock data
  const getUserResumes = (): ResumeWithOwnership[] => {
    if (!user?.id) return [];

    const { owned, tracked } = getAllResumesForUser(user.id);

    const ownedWithOwnership: ResumeWithOwnership[] = owned.map(resume => ({
      id: resume.id,
      name: resume.name,
      privacy: resume.privacy,
      isMaster: resume.isMaster,
      isActive: resume.isActive,
      parentId: resume.parentId,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      views: resume.views,
      summary: resume.data.Basics.Summary,
      title: resume.data.Basics.Label,
      userId: resume.userId,
      ownership: 'owned' as const
    }));

    const trackedWithOwnership: ResumeWithOwnership[] = tracked.map(resume => ({
      id: resume.id,
      name: resume.name,
      privacy: resume.privacy,
      isMaster: resume.isMaster,
      isActive: resume.isActive,
      parentId: resume.parentId,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      views: resume.views,
      summary: resume.data.Basics.Summary,
      title: resume.data.Basics.Label,
      userId: resume.userId,
      ownership: 'tracked' as const
    }));

    return [...ownedWithOwnership, ...trackedWithOwnership];
  };

  useEffect(() => {
    if (id) {
      loadResumeById(id);
    } else {
      loadResumes();
    }
  }, [id]);

  const loadResumes = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      setResumes(getUserResumes());
    } catch (error) {
      console.error('Failed to load resumes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadResumeById = async (resumeId: string) => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      const resumeMetadata = getUserResumes().find(r => r.id === resumeId);
      const mockResume: Resume = {
        id: resumeId,
        name: resumeMetadata?.name || 'Software Engineer Resume',
        privacy: resumeMetadata?.privacy || 'private',
        isMaster: resumeMetadata?.isMaster || true,
        isActive: resumeMetadata?.isActive || false,
        parentId: resumeMetadata?.parentId,
        createdAt: resumeMetadata?.createdAt || '2024-01-15T10:00:00Z',
        updatedAt: resumeMetadata?.updatedAt || '2024-01-20T14:30:00Z',
        views: resumeMetadata?.views || 45,
        userId: user?.id || '',
        data: {
          Basics: {
            Name: "Sean Hogg",
            Label: "CTO and Technology Leader",
            Image: "",
            Email: "seanhogg@gmail.com",
            Phone: "2488250176",
            Url: "",
            Summary: "CTO and Technology Leader with 25 years of experience driving business value through innovative technology solutions with amazing teams.",
            Location: null
          },
          Work: [
            {
              Name: "OnTheClock",
              Position: "CTO / Architect / Agile Practitioner",
              Summary: "Led engineering teams and modernized processes",
              StartDate: "2024-04-01",
              EndDate: "2024-11-01",
              Highlights: [
                "Led onshore/offshore product engineering web & mobile teams",
                "Modernized all engineering processes by teaching Scrum",
                "Transformed Release Management into DevSecOps + GitOps"
              ],
              Url: ""
            }
          ],
          Volunteer: [],
          Education: [
            {
              Institution: "University of Windsor",
              Area: "Computer Science",
              StudyType: "Bachelor",
              StartDate: "1999-01-01",
              EndDate: "2004-12-01",
              Score: "",
              Courses: null,
              Url: ""
            }
          ],
          Awards: [],
          Certificates: [],
          Publications: [],
          Skills: [
            { Name: "JavaScript", Level: "Expert", Keywords: [] },
            { Name: "React", Level: "Advanced", Keywords: [] },
            { Name: "Node.js", Level: "Advanced", Keywords: [] }
          ],
          Languages: [],
          Interests: [],
          References: [],
          Projects: []
        }
      };
      setSelectedResume(mockResume);
      setView('viewer');
    } catch (error) {
      console.error('Failed to load resume:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (response: ResumeUploadResponse) => {
    setSuccessMessage('Resume uploaded successfully!');
    setView('list');
    loadResumes();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleCreateResume = (request: CreateResumeRequest) => {
    setSuccessMessage('Resume created successfully!');
    setView('list');
    loadResumes();
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleUpdateResume = (request: UpdateResumeRequest) => {
    setSuccessMessage('Resume updated successfully!');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleResumeView = (resumeId: string) => {
    navigate(`/resumes/${resumeId}`);
  };

  const handleCreateVariation = (parentId: string) => {
    // Load parent resume data and pre-populate builder
    setView('builder');
  };

  // Action handlers for ActionsModal
  const handleOpenActions = (resumeId: string) => {
    const resume = resumes.find(r => r.id === resumeId);
    if (resume) {
      const item = {
        id: resume.id,
        ownerId: user?.id,
        type: 'resume' as const,
        contentType: 'text' as const,
        ...resume
      };
      setActionsModal({ isOpen: true, item });
    }
  };

  const handleCloseActions = () => {
    setActionsModal({ isOpen: false, item: null });
  };

  const handleShare = (item: any) => {
    const shareUrl = `${window.location.origin}/resumes/${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    setSuccessMessage('Resume link copied to clipboard!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEdit = (item: any) => {
    navigate(`/resumes/${item.id}`);
  };

  const handleDownload = (item: any) => {
    // Simulate download
    setSuccessMessage('Resume download started!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleDelete = (item: any) => {
    // Remove from local state (in real app, this would be an API call)
    setResumes(resumes.filter(r => r.id !== item.id));
    setSuccessMessage('Resume deleted successfully!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleTrack = (item: any) => {
    if (user?.id && item.id) {
      if (isResumeTrackedByUser(item.id, user.id)) {
        removeTrackedResume(item.id, user.id);
        setSuccessMessage('Resume removed from tracking list!');
      } else {
        addTrackedResume(item.id, user.id);
        setSuccessMessage('Resume added to tracking list!');
      }
      // Refresh the resume list
      setResumes(getUserResumes());
      setTimeout(() => setSuccessMessage(null), 3000);
    }
  };

  const handleSetActive = (resumeId: string) => {
    // Set the selected resume as active and all others as inactive
    const updatedResumes = resumes.map(resume => ({
      ...resume,
      isActive: resume.id === resumeId
    }));
    setResumes(updatedResumes);
    setSuccessMessage('Resume set as active!');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const getActiveResume = () => {
    return resumes.find(resume => resume.isActive && resume.ownership === 'owned');
  };

  const filteredResumes = resumes.filter(resume => {
    if (searchTerm && !resume.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !resume.summary.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.privacy && resume.privacy !== filters.privacy) {
      return false;
    }
    if (filters.isMaster !== undefined && resume.isMaster !== filters.isMaster) {
      return false;
    }
    return true;
  });

  // Group resumes by master/child relationship for tree view
  const getResumeTree = () => {
    const masterResumes = filteredResumes.filter(resume => resume.isMaster || !resume.parentId);
    const variations = filteredResumes.filter(resume => !resume.isMaster && resume.parentId);

    return masterResumes.map(master => ({
      ...master,
      children: variations.filter(variation => variation.parentId === master.id)
    }));
  };

  const ownedResumes = filteredResumes.filter(r => r.ownership === 'owned');
  const trackedResumes = filteredResumes.filter(r => r.ownership === 'tracked');

  const resumeTree = getResumeTree();

  const toggleMasterExpansion = (masterId: string) => {
    const newExpanded = new Set(expandedMasters);
    if (newExpanded.has(masterId)) {
      newExpanded.delete(masterId);
    } else {
      newExpanded.add(masterId);
    }
    setExpandedMasters(newExpanded);
  };

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
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
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <FileText className="h-12 w-12 text-primary" />
                    <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Video Resumes
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Transform Your Resume into a Powerful Video Story
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Stand out from the crowd with AI-powered video resumes that showcase your personality, skills, and experience in ways traditional resumes never could.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8">
                      Create Your Video Resume
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">3x</div>
                  <p className="text-sm text-muted-foreground">More likely to get interviews</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">85%</div>
                  <p className="text-sm text-muted-foreground">Higher response rate</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">2 min</div>
                  <p className="text-sm text-muted-foreground">Average creation time</p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">500K+</div>
                  <p className="text-sm text-muted-foreground">Video resumes created</p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Everything You Need to Succeed</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Zap className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>AI-Powered Creation</CardTitle>
                      <CardDescription>
                        Our AI analyzes your resume and creates compelling video scripts tailored to your industry and experience level.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Smart script generation
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Industry-specific templates
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Personal branding tips
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>Performance Analytics</CardTitle>
                      <CardDescription>
                        Track how your video resume performs with detailed analytics on views, engagement, and recruiter interest.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          View tracking & heatmaps
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Engagement metrics
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Recruiter insights
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <Users className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>Professional Network</CardTitle>
                      <CardDescription>
                        Connect directly with hiring managers and recruiters who are actively looking for candidates like you.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Direct recruiter access
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Smart job matching
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Interview scheduling
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Upload Resume</h3>
                    <p className="text-sm text-muted-foreground">Upload your existing resume in any format</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. AI Magic</h3>
                    <p className="text-sm text-muted-foreground">Our AI creates a personalized video script</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Video className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Record Video</h3>
                    <p className="text-sm text-muted-foreground">Record your video using our guided tools</p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Get Hired</h3>
                    <p className="text-sm text-muted-foreground">Share with employers and track your success</p>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">Success Stories</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "I got 5 interview requests within a week of posting my video resume. The AI script was spot-on and helped me highlight my strengths perfectly."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Sarah Chen</p>
                          <p className="text-xs text-muted-foreground">Software Engineer</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "As a career changer, I struggled to explain my transition. The video resume helped me tell my story in a way that resonated with employers."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Michael Rodriguez</p>
                          <p className="text-xs text-muted-foreground">Marketing Manager</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "Landed my dream job at a Fortune 500 company! The video resume made me stand out from hundreds of other applicants."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Emma Johnson</p>
                          <p className="text-xs text-muted-foreground">Product Designer</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">Ready to Create Your Video Resume?</h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who have transformed their careers with video resumes.
                </p>
                <Link to="/signup">
                  <Button size="lg" className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90">
                    Get Started Free Today
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user resume management interface
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
          <div className="max-w-7xl mx-auto">
            {/* Success Message */}
            {successMessage && (
              <Alert className="mb-6">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {/* Upload View */}
            {view === 'upload' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-3xl font-bold">Upload Resume</h1>
                  <Button variant="outline" onClick={() => setView('list')}>
                    Back to Resumes
                  </Button>
                </div>
                <ResumeUpload
                  onUploadSuccess={handleUploadSuccess}
                  onCancel={() => setView('list')}
                />
              </div>
            )}

            {/* Builder View */}
            {view === 'builder' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h1 className="text-3xl font-bold">Create Resume</h1>
                  <Button variant="outline" onClick={() => setView('list')}>
                    Back to Resumes
                  </Button>
                </div>
                <ResumeBuilder
                  onSave={handleCreateResume}
                  onCancel={() => setView('list')}
                />
              </div>
            )}

            {/* Viewer View */}
            {view === 'viewer' && selectedResume && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <Button variant="outline" onClick={() => { setView('list'); navigate('/resumes'); }}>
                    ← Back to Resumes
                  </Button>
                </div>
                <ResumeViewer
                  resume={selectedResume}
                  onUpdate={handleUpdateResume}
                  onCreateVariation={handleCreateVariation}
                  canEdit={true}
                />
              </div>
            )}

            {/* List View */}
            {view === 'list' && (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold">Your Resumes</h1>
                    <div className="flex items-center gap-2">
                      <p className="text-muted-foreground">Manage and track your resumes.</p>
                      {getActiveResume() && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <Target className="w-3 h-3 mr-1" />
                          Active: {getActiveResume()?.name}
                        </Badge>
                      )}
                      {!getActiveResume() && user?.role === 'job_seeker' && (
                        <Badge variant="outline" className="text-orange-600 border-orange-200">
                          No active resume
                        </Badge>
                      )}
                      {(user?.role === 'recruiter' || user?.role === 'business') && (
                        <Badge variant="outline" className="text-blue-600 border-blue-200">
                          {user.role === 'recruiter' ? 'Recruiter' : 'Business'} • Tracking {resumes.filter(r => r.ownership === 'tracked').length} resumes
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => navigate('/resumes/upload')} variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Resume
                    </Button>
                    <Button onClick={() => {
                      const newId = generateResumeId();
                      navigate(`/resumes/create/${newId}`);
                    }}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Resume
                    </Button>
                  </div>
                </div>

                {/* Search and Filters */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search resumes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                      </div>
                      <Select
                        value={filters.privacy || 'all'}
                        onValueChange={(value) => setFilters({ ...filters, privacy: value === 'all' ? undefined : value as ResumePrivacy })}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Privacy" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Privacy</SelectItem>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="recruiter_only">Recruiter Only</SelectItem>
                          <SelectItem value="public">Public</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={filters.isMaster === undefined ? 'all' : filters.isMaster ? 'master' : 'variation'}
                        onValueChange={(value) => setFilters({ ...filters, isMaster: value === 'all' ? undefined : value === 'master' })}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="master">Master</SelectItem>
                          <SelectItem value="variation">Variation</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center border rounded-md">
                        <Button
                          variant={viewMode === 'grid' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('grid')}
                          className="rounded-r-none"
                        >
                          <Grid className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={viewMode === 'list' ? 'default' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('list')}
                          className="rounded-l-none"
                        >
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Resume Grid/List */}
                {loading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground mt-4">Loading resumes...</p>
                  </div>
                ) : filteredResumes.length > 0 ? (
                  viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {filteredResumes.map((resume) => (
                        <ResumeCard
                          key={resume.id}
                          id={resume.id}
                          name={resume.name}
                          title={resume.title}
                          summary={resume.summary}
                          createdAt={resume.createdAt}
                          views={resume.views}
                          privacy={resume.privacy}
                          isMaster={resume.isMaster}
                          isActive={resume.isActive}
                          parentId={resume.parentId}
                          ownership={resume.ownership}
                          onView={() => handleResumeView(resume.id)}
                          onActions={() => handleOpenActions(resume.id)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {resumeTree.map((masterResume) => (
                        <div key={masterResume.id} className="border rounded-lg overflow-hidden">
                          {/* Master Resume */}
                          <div className="bg-muted/30">
                            <div className="flex items-center p-4">
                              {masterResume.children.length > 0 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleMasterExpansion(masterResume.id)}
                                  className="mr-3 p-1 h-6 w-6"
                                >
                                  {expandedMasters.has(masterResume.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                              {masterResume.children.length === 0 && (
                                <div className="mr-3 w-6" />
                              )}

                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <h3 className="font-semibold text-lg">{masterResume.name}</h3>
                                      {masterResume.title && (
                                        <p className="text-sm text-muted-foreground">{masterResume.title}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {masterResume.isActive && (
                                        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                          <Target className="w-3 h-3 mr-1" />
                                          Active
                                        </Badge>
                                      )}
                                      {masterResume.isMaster && (
                                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                                          <Star className="w-3 h-3 mr-1" />
                                          Master
                                        </Badge>
                                      )}
                                      <Badge className={`text-xs ${
                                        masterResume.privacy === 'public' ? 'bg-green-100 text-green-800' :
                                        masterResume.privacy === 'recruiter_only' ? 'bg-blue-100 text-blue-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {masterResume.privacy === 'public' && <Globe className="w-3 h-3 mr-1" />}
                                        {masterResume.privacy === 'recruiter_only' && <Users className="w-3 h-3 mr-1" />}
                                        {masterResume.privacy === 'private' && <Lock className="w-3 h-3 mr-1" />}
                                        {masterResume.privacy === 'public' ? 'Public' :
                                         masterResume.privacy === 'recruiter_only' ? 'Recruiter Only' : 'Private'}
                                      </Badge>
                                      {masterResume.children.length > 0 && (
                                        <Badge variant="outline" className="text-xs">
                                          {masterResume.children.length} variation{masterResume.children.length !== 1 ? 's' : ''}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Eye className="w-3 h-3" />
                                      {masterResume.views}
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(masterResume.createdAt).toLocaleDateString()}
                                    </div>
                                    {!masterResume.isActive && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleSetActive(masterResume.id)}
                                        className="text-green-600 border-green-200 hover:bg-green-50"
                                      >
                                        <Power className="w-4 h-4 mr-2" />
                                        Set Active
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleResumeView(masterResume.id)}
                                    >
                                      <Eye className="w-4 h-4 mr-2" />
                                      View
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenActions(masterResume.id)}
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>

                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {masterResume.summary}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Child Variations */}
                          {expandedMasters.has(masterResume.id) && masterResume.children.length > 0 && (
                            <div className="bg-background border-t">
                              {masterResume.children.map((variation, index) => (
                                <div
                                  key={variation.id}
                                  className={`flex items-center p-4 pl-12 ${
                                    index < masterResume.children.length - 1 ? 'border-b border-muted' : ''
                                  }`}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div>
                                          <h4 className="font-medium">{variation.name}</h4>
                                          {variation.title && (
                                            <p className="text-sm text-muted-foreground">{variation.title}</p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {variation.isActive && (
                                            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                              <Target className="w-3 h-3 mr-1" />
                                              Active
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="text-xs">
                                            <Copy className="w-3 h-3 mr-1" />
                                            Variation
                                          </Badge>
                                          <Badge className={`text-xs ${
                                            variation.privacy === 'public' ? 'bg-green-100 text-green-800' :
                                            variation.privacy === 'recruiter_only' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-800'
                                          }`}>
                                            {variation.privacy === 'public' && <Globe className="w-3 h-3 mr-1" />}
                                            {variation.privacy === 'recruiter_only' && <Users className="w-3 h-3 mr-1" />}
                                            {variation.privacy === 'private' && <Lock className="w-3 h-3 mr-1" />}
                                            {variation.privacy === 'public' ? 'Public' :
                                             variation.privacy === 'recruiter_only' ? 'Recruiter Only' : 'Private'}
                                          </Badge>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Eye className="w-3 h-3" />
                                          {variation.views}
                                        </div>
                                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                          <Calendar className="w-3 h-3" />
                                          {new Date(variation.createdAt).toLocaleDateString()}
                                        </div>
                                        {!variation.isActive && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSetActive(variation.id)}
                                            className="text-green-600 border-green-200 hover:bg-green-50"
                                          >
                                            <Power className="w-4 h-4 mr-2" />
                                            Set Active
                                          </Button>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleResumeView(variation.id)}
                                        >
                                          <Eye className="w-4 h-4 mr-2" />
                                          View
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleOpenActions(variation.id)}
                                        >
                                          <MoreHorizontal className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    </div>

                                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                      {variation.summary}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {searchTerm || Object.keys(filters).length > 0 ? 'No matching resumes' : 'No resumes yet'}
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        {searchTerm || Object.keys(filters).length > 0
                          ? 'Try adjusting your search criteria or filters'
                          : 'Create your first resume to get started'
                        }
                      </p>
                      <div className="flex gap-2 justify-center">
                        {user?.role === 'job_seeker' && (
                          <>
                            <Button onClick={() => navigate('/resumes/upload')} variant="outline">
                              <Upload className="h-4 w-4 mr-2" />
                              Upload Resume
                            </Button>
                            <Button onClick={() => {
                              const newId = generateResumeId();
                              navigate(`/resumes/create/${newId}`);
                            }}>
                              <Plus className="h-4 w-4 mr-2" />
                              Create Resume
                            </Button>
                          </>
                        )}
                        {(user?.role === 'recruiter' || user?.role === 'business') && (
                          <p className="text-sm text-muted-foreground">
                            Browse and track candidate resumes from the home page search.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>

      {/* Actions Modal */}
      <ActionsModal
        isOpen={actionsModal.isOpen}
        onClose={handleCloseActions}
        item={actionsModal.item}
        user={user ? {
          id: user.id,
          isAuthenticated: true,
          role: user.role || 'job_seeker'
        } : null}
        onView={() => actionsModal.item && handleResumeView(actionsModal.item.id)}
        onShare={() => actionsModal.item && handleShare(actionsModal.item)}
        onEdit={() => actionsModal.item && handleEdit(actionsModal.item)}
        onDownload={() => actionsModal.item && handleDownload(actionsModal.item)}
        onDelete={() => actionsModal.item && handleDelete(actionsModal.item)}
        onTrack={() => actionsModal.item && handleTrack(actionsModal.item)}
      />
    </div>
  );
}

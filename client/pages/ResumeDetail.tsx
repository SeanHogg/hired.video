import {
  ArrowLeft,
  Edit,
  Play,
  Calendar,
  Mail,
  Phone,
  ExternalLink,
  Building,
  GraduationCap,
  Heart,
  Award,
  Share2,
  Download,
  ChevronRight,
  Target,
  Globe,
  Users,
  Lock,
  Star,
  BookOpen,
  Languages,
  Lightbulb,
  UserCheck,
  FolderOpen,
  Trophy,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AuthOverlay from "@/components/AuthOverlay";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resumeService } from "@/lib/services/resume-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import type { Resume } from "@/types/resume";

interface TimelineItemProps {
  title: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  description?: string;
  highlights?: string[];
  icon: React.ComponentType<any>;
  isLast?: boolean;
}

function TimelineItem({
  title,
  subtitle,
  startDate,
  endDate,
  description,
  highlights,
  icon: Icon,
  isLast = false,
}: TimelineItemProps) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    if (dateString === "Present") return "Present";
    if (!dateString) return "No date";
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return "Invalid date";
    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
    });
  };

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-6 top-12 w-0.5 h-full bg-gradient-to-b from-primary to-primary/20" />
      )}

      <div
        className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center relative z-10">
          <Icon className="w-6 h-6 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="text-primary font-medium">{subtitle}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4" />
                <span>
                  {formatDate(startDate)} - {formatDate(endDate)}
                </span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
              />
            </div>
          </div>

          {description && (
            <p className="text-muted-foreground mt-2">{description}</p>
          )}

          {expanded && highlights && highlights.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Key Achievements
              </h4>
              <ul className="space-y-2">
                {highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const loadResume = async () => {
      if (!id) return;

      setLoading(true);
      try {
        // Primary: standard endpoint (respects privacy/auth)
        const foundResume = await resumeService.getResumeById(id);
        setResume(foundResume);
      } catch (error) {
        console.error("Failed to load resume via /api/Resume/{id}, attempting embedded endpoint:", error);
        try {
          // Fallback: embedded endpoint allows public viewing by slug or GUID
          const embedded = await resumeService.getResumeForEmbed(id);
          setResume(embedded);
        } catch (embeddedErr) {
          console.error("Failed to load resume via embedded endpoint:", embeddedErr);
        }
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, [id]);

  const isOwner = user?.id === resume?.userId;

  const getPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case "public":
        return <Globe className="w-4 h-4" />;
      case "recruiter_only":
        return <Users className="w-4 h-4" />;
      case "connections":
        return <Users className="w-4 h-4" />;
      case "private":
        return <Lock className="w-4 h-4" />;
      default:
        return <Lock className="w-4 h-4" />;
    }
  };

  const getPrivacyText = (privacy: string) => {
    switch (privacy) {
      case "public":
        return "Public";
      case "recruiter_only":
        return "Recruiter Only";
      case "connections":
        return "Connections";
      case "private":
        return "Private";
      default:
        return "Private";
    }
  };

  if (loading) {
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
            <div className="max-w-4xl mx-auto">
              <div className="animate-pulse space-y-6">
                <div className="h-8 bg-muted rounded w-1/3" />
                <div className="h-64 bg-muted rounded" />
                <div className="space-y-4">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!resume) {
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
              <h1 className="text-2xl font-bold mb-4">Resume Not Found</h1>
              <p className="text-muted-foreground mb-6">
                The resume you're looking for doesn't exist or has been removed.
              </p>
              <Button onClick={() => navigate("/resumes")}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Resumes
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Remove the editing view since we now have a separate edit page

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

        <div className={`pt-16 ${!isAuthenticated ? "relative" : ""}`}>
          {!isAuthenticated && (
            <AuthOverlay
              contentType="resume"
              title={resume?.data?.Basics?.Name || resume?.name || "Resume"}
            />
          )}
          {/* Header with Video */}
          <div className="relative bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground">
            <div className="absolute inset-0 bg-[url('/placeholder.svg')] bg-cover bg-center opacity-10" />
            <div className="relative max-w-6xl mx-auto px-6 py-12">
              {/* Navigation */}
              <div className="flex items-center justify-between mb-8">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/resumes")}
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Resumes
                </Button>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    {resume.isActive && (
                      <Badge
                        variant="secondary"
                        className="bg-green-100 text-green-800"
                      >
                        <Target className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    )}
                    {resume.isMaster && (
                      <Badge
                        variant="secondary"
                        className="bg-yellow-100 text-yellow-800"
                      >
                        <Star className="w-3 h-3 mr-1" />
                        Master
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="bg-white/20 text-primary-foreground"
                    >
                      {getPrivacyIcon(resume.privacy)}
                      <span className="ml-1">
                        {getPrivacyText(resume.privacy)}
                      </span>
                    </Badge>
                  </div>

                  {isOwner && (
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/resumes/edit/${resume.id}`)}
                      className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit Resume
                    </Button>
                  )}

                  <Button
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>
                </div>
              </div>

              {/* Video Resume Header */}
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="w-20 h-20 border-4 border-white/30">
                      <AvatarImage
                        src={resume?.data?.Basics?.Image || ""}
                      />
                      <AvatarFallback className="text-2xl bg-white/20">
                        {resume?.data?.Basics?.Name
                          ?.split(" ")
                          .map((n: string) => n[0])
                          .join("") || "??"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h1 className="text-4xl font-bold">
                        {resume?.data?.Basics?.Name || resume?.name || "Untitled Resume"}
                      </h1>
                      <p className="text-xl opacity-90">
                        {resume?.data?.Basics?.Label || ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {resume?.data?.Basics?.Email && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `mailto:${resume.data.Basics.Email}`,
                          )
                        }
                        className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        Email
                      </Button>
                    )}
                    {resume?.data?.Basics?.Phone && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.open(
                            `tel:${resume.data.Basics.Phone}`,
                          )
                        }
                        className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                      >
                        <Phone className="w-4 h-4 mr-2" />
                        Call
                      </Button>
                    )}
                    {resume?.data?.Basics?.Url && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          window.open(
                            resume.data.Basics.Url,
                            "_blank",
                          )
                        }
                        className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Portfolio
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="bg-white/20 hover:bg-white/30 text-primary-foreground border-white/30"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Button>
                  </div>

                  <p className="text-lg leading-relaxed opacity-95">
                    {resume?.data?.Basics?.Summary || ""}
                  </p>
                </div>

                {/* Video Preview */}
                <div className="relative">
                  <Card className="bg-white/10 border-white/30 backdrop-blur-sm">
                    <CardContent className="p-6">
                      <div className="aspect-video bg-black/20 rounded-lg flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
                        <Dialog open={showVideo} onOpenChange={setShowVideo}>
                          <DialogTrigger asChild>
                            <Button
                              size="lg"
                              variant="secondary"
                              className="relative z-10"
                            >
                              <Play className="w-6 h-6 mr-2" />
                              Play Video Resume
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>
                                Video Resume -{" "}
                                {resume?.data?.Basics?.Name || resume?.name}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="aspect-video bg-black rounded-lg flex items-center justify-center">
                              <div className="text-center">
                                <Play className="w-16 h-16 mx-auto mb-4 text-white/60" />
                                <p className="text-white/80">
                                  AI-Generated Video Resume
                                </p>
                                <p className="text-white/60 text-sm">
                                  Video would be generated and displayed here
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <p className="text-center mt-4 text-sm opacity-80">
                        AI-Generated Video Resume • 2:15 duration
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="max-w-6xl mx-auto px-6 py-12 space-y-12">
            {/* Work Experience Timeline */}
            {resume?.data?.Work &&
              resume.data.Work.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <Building className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold">Work Experience</h2>
                  </div>

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {resume.data.Work
                          .sort(
                            (a, b) =>
                              new Date(b.StartDate || "").getTime() -
                              new Date(a.StartDate || "").getTime(),
                          )
                          .map((work, index) => (
                            <TimelineItem
                              key={index}
                              title={work.Position || ""}
                              subtitle={work.Name || ""}
                              startDate={work.StartDate || ""}
                              endDate={work.EndDate || "Present"}
                              description={work.Summary || ""}
                              highlights={work.Highlights}
                              icon={Building}
                              isLast={
                                index === resume.data.Work.length - 1
                              }
                            />
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              )}

            {/* Education Timeline */}
            {resume?.data?.Education &&
              resume.data.Education.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold">Education</h2>
                  </div>

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {resume.data.Education
                          .sort(
                            (a, b) =>
                              new Date(b.StartDate || "").getTime() -
                              new Date(a.StartDate || "").getTime(),
                          )
                          .map((edu, index) => (
                            <TimelineItem
                              key={index}
                              title={`${edu.StudyType || ""} in ${edu.Area || ""}`}
                              subtitle={edu.Institution || ""}
                              startDate={edu.StartDate || ""}
                              endDate={edu.EndDate || ""}
                              description={
                                edu.Score ? `GPA: ${edu.Score}` : undefined
                              }
                              icon={GraduationCap}
                              isLast={
                                index === resume.data.Education.length - 1
                              }
                            />
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              )}

            {/* Volunteer Experience Timeline */}
            {resume?.data?.Volunteer &&
              resume.data.Volunteer.length > 0 && (
                <section>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <Heart className="w-5 h-5 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold">Volunteer Experience</h2>
                  </div>

                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        {resume.data.Volunteer
                          .sort(
                            (a, b) =>
                              new Date(b.StartDate || "").getTime() -
                              new Date(a.StartDate || "").getTime(),
                          )
                          .map((volunteer, index) => (
                            <TimelineItem
                              key={index}
                              title={volunteer.Position || ""}
                              subtitle={volunteer.Organization || ""}
                              startDate={volunteer.StartDate || ""}
                              endDate={volunteer.EndDate || "Present"}
                              description={volunteer.Summary || ""}
                              highlights={volunteer.Highlights || undefined}
                              icon={Heart}
                              isLast={
                                index === resume.data.Volunteer.length - 1
                              }
                            />
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                </section>
              )}

            {/* Skills */}
            {resume?.data?.Skills && resume.data.Skills.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Star className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Skills</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {resume.data.Skills.map((skill, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg mb-2">
                            {skill.Name}
                          </h3>
                          {skill.Level && (
                            <p className="text-sm text-muted-foreground mb-2">
                              Level: {skill.Level}
                            </p>
                          )}
                          {skill.Keywords && skill.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {skill.Keywords.map((keyword, keywordIndex) => (
                                <span
                                  key={keywordIndex}
                                  className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Languages */}
            {resume?.data?.Languages && resume.data.Languages.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Languages className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Languages</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {resume.data.Languages.map((language, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg">
                            {language.Language}
                          </h3>
                          {language.Fluency && (
                            <p className="text-sm text-muted-foreground">
                              {language.Fluency}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Projects */}
            {resume?.data?.Projects && resume.data.Projects.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Projects</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-6">
                      {resume.data.Projects.map((project, index) => (
                        <div key={index} className="border-b pb-6 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">
                              {project.Name}
                            </h3>
                            {project.Url && (
                              <a
                                href={project.Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>

                          {(project.StartDate || project.EndDate) && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {project.StartDate} - {project.EndDate || "Present"}
                            </p>
                          )}

                          {project.Entity && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {project.Entity}
                            </p>
                          )}

                          {project.Description && (
                            <p className="text-sm mb-3">{project.Description}</p>
                          )}

                          {project.Highlights && project.Highlights.length > 0 && (
                            <ul className="list-disc list-inside text-sm mb-3 space-y-1">
                              {project.Highlights.map((highlight, highlightIndex) => (
                                <li key={highlightIndex}>{highlight}</li>
                              ))}
                            </ul>
                          )}

                          {project.Keywords && project.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {project.Keywords.map((keyword, keywordIndex) => (
                                <span
                                  key={keywordIndex}
                                  className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Awards */}
            {resume?.data?.Awards && resume.data.Awards.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Awards</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {resume.data.Awards.map((award, index) => (
                        <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg">{award.Title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            {award.Awarder && <span>{award.Awarder}</span>}
                            {award.Date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {award.Date}
                              </span>
                            )}
                          </div>
                          {award.Summary && (
                            <p className="text-sm">{award.Summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Certificates */}
            {resume?.data?.Certificates && resume.data.Certificates.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Certificates</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {resume.data.Certificates.map((certificate, index) => (
                        <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{certificate.Name}</h3>
                            {certificate.Url && (
                              <a
                                href={certificate.Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {certificate.Issuer && <span>{certificate.Issuer}</span>}
                            {certificate.Date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {certificate.Date}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Publications */}
            {resume?.data?.Publications && resume.data.Publications.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Publications</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {resume.data.Publications.map((publication, index) => (
                        <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="font-semibold text-lg">{publication.Name}</h3>
                            {publication.Url && (
                              <a
                                href={publication.Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                            {publication.Publisher && <span>{publication.Publisher}</span>}
                            {publication.ReleaseDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {publication.ReleaseDate}
                              </span>
                            )}
                          </div>
                          {publication.Summary && (
                            <p className="text-sm">{publication.Summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Interests */}
            {resume?.data?.Interests && resume.data.Interests.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <Lightbulb className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">Interests</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {resume.data.Interests.map((interest, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <h3 className="font-semibold text-lg mb-2">
                            {interest.Name}
                          </h3>
                          {interest.Keywords && interest.Keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {interest.Keywords.map((keyword, keywordIndex) => (
                                <span
                                  key={keywordIndex}
                                  className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded"
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* References */}
            {resume?.data?.References && resume.data.References.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-3xl font-bold">References</h2>
                </div>

                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {resume.data.References.map((reference, index) => (
                        <div key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg">{reference.Name}</h3>
                          {reference.Reference && (
                            <p className="text-sm text-muted-foreground">
                              {reference.Reference}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>

          <Footer />
        </div>
      </div>
    </div>
  );
}

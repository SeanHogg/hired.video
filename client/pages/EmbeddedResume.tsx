import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Share2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import ShareModal from "@/components/ShareModal";
import { userService } from "@/lib/services/user-service";
import { resumeService } from "@/lib/services/resume-service";
import type { UserProfile } from "@/lib/services/user-service";
import type { Resume } from "@/lib/services/resume-service";

export default function EmbeddedResume() {
  const { identifier } = useParams<{ identifier: string }>();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  useEffect(() => {
    if (!identifier) {
      setError("No identifier provided");
      setLoading(false);
      return;
    }

    loadResumeData();
  }, [identifier]);

  const loadResumeData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if identifier looks like a UUID (resume ID)
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          identifier,
        );

      let userData: UserProfile | null = null;
      let resumeData: Resume | null = null;

      if (isUUID) {
        // Try to get resume by ID first (most likely case for embedded resumes)
        try {
          resumeData = await resumeService.getResumeById(identifier);
          if (resumeData) {
            // Get the user who owns this resume
            try {
              userData = await userService.getUserById(resumeData.userId);
            } catch (err) {
              console.log(
                "Failed to get user from resume userId, will use resume data only",
              );
            }
          }
        } catch (err) {
          console.log("Failed to get resume by ID:", err);
          setError("Resume not found");
          setLoading(false);
          return;
        }
      } else {
        // If not a UUID, try to get user by slug and then their default resume
        try {
          userData = await userService.getUserBySlug(identifier);
          if (userData) {
            // Try to get user's default resume
            try {
              const userResumes = await resumeService.getUserResumes();
              const defaultResume =
                userResumes.find(
                  (r) => (r as any).isDefault || r.isPrimaryDefault,
                ) || userResumes[0];
              if (defaultResume) {
                resumeData = await resumeService.getResumeById(
                  defaultResume.id,
                );
              }
            } catch (err) {
              console.log(
                "Failed to get user resumes, will create from profile",
              );
            }
          }
        } catch (err) {
          console.log("Failed to get user by slug:", err);
          setError("User not found");
          setLoading(false);
          return;
        }
      }

      if (!resumeData) {
        setError("Resume not found");
        setLoading(false);
        return;
      }

      setResume(resumeData);

      // If we have user data, use it; otherwise try to get it from resume
      if (userData) {
        setUser(userData);
      } else if (resumeData.userId) {
        try {
          userData = await userService.getUserById(resumeData.userId);
          setUser(userData);
        } catch (err) {
          console.log("Could not get user data, will use resume data only");
        }
      }
    } catch (err) {
      console.error("Error loading resume data:", err);
      setError("Failed to load resume data");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = () => {
    setShareModalOpen(true);
  };

  const getShareUrl = () => {
    return window.location.href;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading resume...</p>
        </div>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Resume Not Found</h1>
          <p className="text-muted-foreground mb-6">
            {error || "The requested resume could not be found."}
          </p>
          <Button asChild>
            <a
              href="https://myvideoresu.me"
              target="_blank"
              rel="noopener noreferrer"
            >
              Create Your Own Resume
            </a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Share Button */}
      <div className="border-b bg-white/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {resume?.metaResume?.basics?.image && (
              <img
                src={resume.metaResume.basics.image}
                alt={resume.metaResume.basics?.name || "Profile"}
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="font-semibold text-lg">
                {resume?.metaResume?.basics?.name || resume?.name || "Resume"}
              </h1>
              {resume?.metaResume?.basics?.label && (
                <p className="text-sm text-muted-foreground">
                  {resume.metaResume.basics.label}
                </p>
              )}
            </div>
          </div>
          <Button onClick={handleShare} variant="outline" size="sm">
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Resume Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {resume && resume.metaResume ? (
          <div className="space-y-8">
            {/* Personal Information */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    {resume.metaResume.basics?.image && (
                      <img
                        src={resume.metaResume.basics.image}
                        alt={resume.metaResume.basics?.name || "Profile"}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <h1 className="text-3xl font-bold">
                        {resume.metaResume.basics?.name ||
                          resume.name ||
                          "Resume"}
                      </h1>
                      {resume.metaResume.basics?.label && (
                        <p className="text-xl text-muted-foreground mt-1">
                          {resume.metaResume.basics.label}
                        </p>
                      )}
                      {resume.metaResume.basics?.location && (
                        <p className="text-muted-foreground mt-2">
                          {[
                            resume.metaResume.basics.location.city,
                            resume.metaResume.basics.location.region,
                            resume.metaResume.basics.location.countryCode,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {resume.metaResume.basics?.summary && (
                  <div>
                    <h3 className="font-semibold mb-2">Summary</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {resume.metaResume.basics.summary}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Contact Information</h3>
                <div className="space-y-2">
                  {resume.metaResume.basics?.email && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Email:</span>{" "}
                      {resume.metaResume.basics.email}
                    </p>
                  )}
                  {resume.metaResume.basics?.phone && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Phone:</span>{" "}
                      {resume.metaResume.basics.phone}
                    </p>
                  )}
                  {resume.metaResume.basics?.url && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Website:</span>{" "}
                      <a
                        href={resume.metaResume.basics.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {resume.metaResume.basics.url}
                      </a>
                    </p>
                  )}
                  {resume.metaResume.basics?.location?.address && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Address:</span>{" "}
                      {resume.metaResume.basics.location.address}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            {resume.metaResume.skills &&
              resume.metaResume.skills.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {resume.metaResume.skills.map((skill, index) => (
                        <Badge key={index} variant="secondary">
                          {skill.name}
                          {skill.level && (
                            <span className="ml-1 text-xs">
                              ({skill.level})
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Work Experience */}
            {resume.metaResume.work && resume.metaResume.work.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Work Experience</h3>
                  <div className="space-y-6">
                    {resume.metaResume.work
                      .sort((a, b) => {
                        // Sort by start date descending (most recent first)
                        const dateA = new Date(a.startDate || "1900-01-01");
                        const dateB = new Date(b.startDate || "1900-01-01");
                        return dateB.getTime() - dateA.getTime();
                      })
                      .map((job, index) => (
                        <div key={index}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{job.position}</h4>
                              <p className="text-muted-foreground">
                                {job.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {job.startDate} - {job.endDate || "Present"}
                              </p>
                            </div>
                          </div>
                          {job.summary && (
                            <p className="text-muted-foreground mt-2 leading-relaxed">
                              {job.summary}
                            </p>
                          )}
                          {job.highlights && job.highlights.length > 0 && (
                            <ul className="list-disc list-inside mt-2 text-muted-foreground">
                              {job.highlights.map((highlight, idx) => (
                                <li key={idx}>{highlight}</li>
                              ))}
                            </ul>
                          )}
                          {index < resume.metaResume.work.length - 1 && (
                            <Separator className="mt-6" />
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Education */}
            {resume.metaResume.education &&
              resume.metaResume.education.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Education</h3>
                    <div className="space-y-4">
                      {resume.metaResume.education
                        .sort((a, b) => {
                          // Sort by start date descending (most recent first)
                          const dateA = new Date(a.startDate || "1900-01-01");
                          const dateB = new Date(b.startDate || "1900-01-01");
                          return dateB.getTime() - dateA.getTime();
                        })
                        .map((edu, index) => (
                          <div key={index}>
                            <h4 className="font-medium">
                              {edu.studyType} in {edu.area}
                            </h4>
                            <p className="text-muted-foreground">
                              {edu.institution}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {edu.startDate} - {edu.endDate || "Present"}
                            </p>
                            {edu.score && (
                              <p className="text-sm text-muted-foreground">
                                Score: {edu.score}
                              </p>
                            )}
                            {index < resume.metaResume.education.length - 1 && (
                              <Separator className="mt-4" />
                            )}
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No resume data available</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t bg-white/50 backdrop-blur-sm mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <span>Powered by</span>
            <a
              href="https://myvideoresu.me"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline flex items-center space-x-1"
            >
              <span>MyVideoResu.ME</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Share Modal */}
      <ShareModal
        open={shareModalOpen}
        onOpenChange={setShareModalOpen}
        shareUrl={getShareUrl()}
        title={
          resume?.metaResume?.basics?.name ||
          resume?.name ||
          "Professional Resume"
        }
        message={
          resume?.metaResume?.basics?.label ||
          resume?.description ||
          "Share this professional resume"
        }
      />
    </div>
  );
}

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
import type { Resume } from "@/types/resume";

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

      // First attempt: use the embed endpoint which bypasses auth/privacy
      try {
        resumeData = await resumeService.getResumeForEmbed(identifier);
      } catch (err) {
        console.log("Embedded endpoint failed, will try fallback logic", err);
      }

      if (!resumeData && isUUID) {
        try {
          resumeData = await resumeService.getResumeById(identifier);
          if (resumeData) {
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
        }
      } else if (!resumeData) {
        // If not a UUID and embed endpoint failed, try to derive via user slug
        try {
          userData = await userService.getUserBySlug(identifier);
          if (userData) {
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
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


      {/* Resume Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {resume && resume.data ? (
          <div className="space-y-8">
            {/* Personal Information */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    {resume.data.Basics?.Image && (
                      <img
                        src={resume.data.Basics.Image}
                        alt={resume.data.Basics?.Name || "Profile"}
                        className="w-20 h-20 rounded-full object-cover"
                      />
                    )}
                    <div>
                      <h1 className="text-3xl font-bold">
                        {resume.data.Basics?.Name ||
                          resume.name ||
                          "Resume"}
                      </h1>
                      {resume.data.Basics?.Label && (
                        <p className="text-xl text-muted-foreground mt-1">
                          {resume.data.Basics.Label}
                        </p>
                      )}
                      {resume.data.Basics?.Location && (
                        <p className="text-muted-foreground mt-2">
                          {[
                            resume.data.Basics.Location.City,
                            resume.data.Basics.Location.Region,
                            resume.data.Basics.Location.CountryCode,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {resume.data.Basics?.Summary && (
                  <div>
                    <h3 className="font-semibold mb-2">Summary</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {resume.data.Basics.Summary}
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
                  {resume.data.Basics?.Email && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Email:</span>{" "}
                      {resume.data.Basics.Email}
                    </p>
                  )}
                  {resume.data.Basics?.Phone && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Phone:</span>{" "}
                      {resume.data.Basics.Phone}
                    </p>
                  )}
                  {resume.data.Basics?.Url && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Website:</span>{" "}
                      <a
                        href={resume.data.Basics.Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {resume.data.Basics.Url}
                      </a>
                    </p>
                  )}
                  {resume.data.Basics?.Location?.Address && (
                    <p className="text-muted-foreground">
                      <span className="font-medium">Address:</span>{" "}
                      {resume.data.Basics.Location.Address}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Skills */}
            {resume.data.Skills &&
              resume.data.Skills.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {resume.data.Skills.map((skill, index) => (
                        <Badge key={index} variant="secondary">
                          {skill.Name}
                          {skill.Level && (
                            <span className="ml-1 text-xs">
                              ({skill.Level})
                            </span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Work Experience */}
            {resume.data.Work && resume.data.Work.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-4">Work Experience</h3>
                  <div className="space-y-6">
                    {resume.data.Work
                      .sort((a, b) => {
                        // Sort by start date descending (most recent first)
                        const dateA = new Date(a.StartDate || "1900-01-01");
                        const dateB = new Date(b.StartDate || "1900-01-01");
                        return dateB.getTime() - dateA.getTime();
                      })
                      .map((job, index) => (
                        <div key={index}>
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{job.Position}</h4>
                              <p className="text-muted-foreground">
                                {job.Name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {job.StartDate} - {job.EndDate || "Present"}
                              </p>
                            </div>
                          </div>
                          {job.Summary && (
                            <p className="text-muted-foreground mt-2 leading-relaxed">
                              {job.Summary}
                            </p>
                          )}
                          {job.Highlights && job.Highlights.length > 0 && (
                            <ul className="list-disc list-inside mt-2 text-muted-foreground">
                              {job.Highlights.map((highlight, idx) => (
                                <li key={idx}>{highlight}</li>
                              ))}
                            </ul>
                          )}
                          {index < resume.data.Work.length - 1 && (
                            <Separator className="mt-6" />
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Education */}
            {resume.data.Education &&
              resume.data.Education.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold mb-4">Education</h3>
                    <div className="space-y-4">
                      {resume.data.Education
                        .sort((a, b) => {
                          // Sort by start date descending (most recent first)
                          const dateA = new Date(a.StartDate || "1900-01-01");
                          const dateB = new Date(b.StartDate || "1900-01-01");
                          return dateB.getTime() - dateA.getTime();
                        })
                        .map((edu, index) => (
                          <div key={index}>
                            <h4 className="font-medium">
                              {edu.StudyType} in {edu.Area}
                            </h4>
                            <p className="text-muted-foreground">
                              {edu.Institution}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {edu.StartDate} - {edu.EndDate || "Present"}
                            </p>
                            {edu.Score && (
                              <p className="text-sm text-muted-foreground">
                                Score: {edu.Score}
                              </p>
                            )}
                            {index < resume.data.Education.length - 1 && (
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
          resume?.data?.Basics?.Name ||
          resume?.name ||
          "Professional Resume"
        }
        message={
          resume?.data?.Basics?.Label ||
          "Share this professional resume"
        }
      />
    </div>
  );
}

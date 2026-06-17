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
import DeclarativeResumeRenderer from "@/components/resume-renderer/DeclarativeResumeRenderer";
import { DEFAULT_DESCRIPTOR, getTemplateById } from "@/types/resume-template";
import { isUuid } from "@shared/value-types";

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

      let userData: UserProfile | null = null;
      let resumeData: Resume | null = null;

      // First attempt: use the embed endpoint which bypasses auth/privacy
      try {
        resumeData = await resumeService.getResumeForEmbed(identifier);
      } catch (err) {
        console.log("Embedded endpoint failed, will try fallback logic", err);
      }

      if (!resumeData && isUuid(identifier)) {
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
              href="https://hired.video"
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
      {/* Resume Content — rendered via the declarative template engine in
          embedded mode (no gradient hero, no platform chrome). Template is
          picked from resume.content.meta.embeddedTemplate with fallback to the
          resume's regular default, then DEFAULT_DESCRIPTOR. */}
      <div className="px-4 py-8">
        {resume ? (
          <DeclarativeResumeRenderer
            resume={resume}
            descriptor={
              getTemplateById(resume.content?.meta?.embeddedTemplate)
              ?? getTemplateById(resume.content?.meta?.template)
              ?? DEFAULT_DESCRIPTOR
            }
            embedded
          />
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No resume data available</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm mt-16">
        <div className="px-4 py-6">
          <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
            <span>Powered by</span>
            <a
              href="https://hired.video"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline flex items-center space-x-1"
            >
              <span>hired.video</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

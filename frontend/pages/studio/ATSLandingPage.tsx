/**
 * ATS Landing Page — public shareable video resume page at /v/:slug
 *
 * Features:
 *   - Video player with engagement tracking
 *   - Candidate name, headline, and text summary (ATS-parseable)
 *   - LinkedIn link
 *   - Clean, professional design optimized for recruiter viewing
 */

import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Play, Pause, ExternalLink, Linkedin, FileText, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VideoTracker } from "@/lib/analytics/video-tracker";
import { apiClient } from "@/lib/api-client";

interface ATSData {
  candidateName: string;
  headline: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  textSummary: string;
  linkedinUrl: string | null;
  viewCount: number;
  /** Studio project id — analytics aggregation key (migration 0085).
   *  The /v/:slug URL is for routing; events still land on the project. */
  projectId: string;
}

export default function ATSLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<ATSData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef<VideoTracker | null>(null);

  useEffect(() => {
    if (!slug) return;

    apiClient
      .get<ATSData>(`/api/studio/ats/${slug}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [slug]);

  // Attach video tracker — key on the project id, not the slug, so events
  // land on the analytics aggregation unit.
  useEffect(() => {
    if (!data?.videoUrl || !data?.projectId || !videoRef.current) return;
    const tracker = new VideoTracker(data.projectId);
    trackerRef.current = tracker;
    const cleanup = tracker.attach(videoRef.current);
    return cleanup;
  }, [data?.videoUrl, data?.projectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Video Not Found</h1>
          <p className="text-muted-foreground">{error ?? "This video resume does not exist or has been removed."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{data.candidateName}</h1>
          {data.headline && (
            <p className="text-lg text-muted-foreground">{data.headline}</p>
          )}
          <div className="flex items-center justify-center gap-4 mt-4">
            <Badge variant="secondary" className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {data.viewCount} views
            </Badge>
            {data.linkedinUrl && (
              <a href={data.linkedinUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2">
                  <Linkedin className="h-4 w-4" />
                  LinkedIn Profile
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Video Player */}
        {data.videoUrl && (
          <Card className="mb-8 overflow-hidden">
            <div className="relative bg-black aspect-video">
              <video
                ref={videoRef}
                src={data.videoUrl}
                poster={data.thumbnailUrl ?? undefined}
                className="w-full h-full object-contain"
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            </div>
          </Card>
        )}

        {/* Text Summary — ATS-parseable */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Professional Summary</h2>
            </div>
            <div className="prose prose-sm max-w-none text-foreground">
              {data.textSummary.split("\n").map((paragraph, i) => (
                <p key={i} className="mb-3 leading-relaxed">{paragraph}</p>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center text-sm text-muted-foreground">
          <p>
            Created with{" "}
            <a
              href="https://hired.video"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              hired.video
            </a>
            {" "}— AI Video Resumes
          </p>
        </div>
      </div>
    </div>
  );
}

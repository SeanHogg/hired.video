/**
 * ContentTab — list of published Studio videos with per-video analytics.
 * Clicking a video's Analytics button expands it inline; clicking Share
 * opens LinkedIn; Copy Link writes the public URL to the clipboard.
 */
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Globe,
  Link2,
  Loader2,
  Lock,
  MousePointer,
  Play,
  Plus,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { type StudioProject, StudioProjectStatus } from "@/lib/services/studio-service";
import SocialShareRow from "@/components/SocialShareRow";

const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);

export interface ContentTabProps {
  publishedProjects: StudioProject[];
}

export function ContentTab({ publishedProjects }: ContentTabProps) {
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My Published Content</h2>
        <Link to="/studio">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Video
          </Button>
        </Link>
      </div>

      {publishedProjects.length > 0 ? (
        <div className="space-y-4">
          {publishedProjects.map((project) => {
            const isExpanded = expandedVideoId === project.id;
            const videoId = project.youtubeVideoId ?? project.id;
            const publicUrl = `https://hired.video/v/${videoId}`;
            return (
              <Card key={project.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="shrink-0 w-32 h-20 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                        {project.thumbnailUrl ? (
                          <img
                            src={project.thumbnailUrl}
                            alt={project.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Play className="h-6 w-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">
                          {project.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant={
                              project.status === StudioProjectStatus.Published
                                ? "default"
                                : "secondary"
                            }
                          >
                            {project.status}
                          </Badge>
                          {project.isPublic ? (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-500">
                              <Globe className="w-3 h-3" /> Public
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Lock className="w-3 h-3" /> Unlisted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" /> {project.viewCount ?? 0} views
                          </span>
                          <span className="flex items-center gap-1">
                            <MousePointer className="w-3 h-3" />{" "}
                            {project.ctaClickCount ?? 0} clicks
                          </span>
                          <span>
                            {new Date(project.creationDateTime).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCopy(project.id, publicUrl)}
                      >
                        {copiedId === project.id ? (
                          <><Check className="w-3 h-3 mr-1 text-emerald-600" /> Copied</>
                        ) : (
                          <><Link2 className="w-3 h-3 mr-1" /> Copy Link</>
                        )}
                      </Button>
                      <SocialShareRow url={publicUrl} title={project.title} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          setExpandedVideoId(isExpanded ? null : project.id)
                        }
                      >
                        <BarChart3 className="w-3 h-3 mr-1" />
                        Analytics
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 ml-1" />
                        ) : (
                          <ChevronRight className="w-3 h-3 ml-1" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="pt-0 border-t">
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          Loading analytics…
                        </div>
                      }
                    >
                      <VideoAnalyticsDashboard
                        videoId={videoId}
                        videoDurationSec={project.script?.video?.duration}
                      />
                    </Suspense>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Video}
          title="No published content yet"
          description="Create and publish videos in the Studio to promote them here"
          action={
            <Link to="/studio">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Go to Studio
              </Button>
            </Link>
          }
        />
      )}
    </div>
  );
}

export default ContentTab;

/**
 * ContentTab — published Studio videos with per-video analytics. The list
 * honours the shared Scroll / Grid / Table view switcher (every content
 * surface carries the button group); the analytics dashboard expands in a
 * single full-width panel below the list so it works in all three layouts.
 * Copy Link writes the public URL; Share opens the social row.
 */
import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Check,
  Eye,
  Globe,
  Link2,
  Loader2,
  Lock,
  MousePointer,
  Play,
  Plus,
  Video,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { OutreachTabToolbar } from "@/components/outreach/shared/OutreachTabToolbar";
import { type StudioProject, StudioProjectStatus } from "@/lib/services/studio-service";
import SocialShareRow from "@/components/SocialShareRow";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { cn } from "@/lib/utils";

const VideoAnalyticsDashboard = lazy(
  () => import("@/components/studio/VideoAnalyticsDashboard"),
);

export interface ContentTabProps {
  publishedProjects: StudioProject[];
}

// The public share URL prefers a YouTube id when published there, otherwise
// the in-platform /v/:projectId route (served by the unified <StudioPlayer/>
// post-#665).
const publicUrlFor = (project: StudioProject) =>
  `https://hired.video/v/${project.youtubeVideoId ?? project.id}`;

export function ContentTab({ publishedProjects }: ContentTabProps) {
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [view, setView] = useViewMode("outreach.content", "grid", BROWSE_VIEW_MODES);

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch { /* clipboard denied */ }
  };

  const toggleAnalytics = (id: string) =>
    setExpandedVideoId((cur) => (cur === id ? null : id));

  const expanded = publishedProjects.find((p) => p.id === expandedVideoId) ?? null;

  const cardProps = (project: StudioProject) => ({
    project,
    copied: copiedId === project.id,
    expanded: expandedVideoId === project.id,
    onCopy: () => handleCopy(project.id, publicUrlFor(project)),
    onToggleAnalytics: () => toggleAnalytics(project.id),
  });

  return (
    <div className="space-y-6">
      {/* Sticky action toolbar — view switcher + Create Video. No title: the
          active "My Content" tab in the action panel above already names the
          surface. */}
      <OutreachTabToolbar>
        <ViewModeToggle value={view} onChange={setView} modes={BROWSE_VIEW_MODES} />
        <Link to="/studio">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Video
          </Button>
        </Link>
      </OutreachTabToolbar>

      {publishedProjects.length === 0 ? (
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
      ) : view === "table" ? (
        <PublishedVideoTable
          projects={publishedProjects}
          copiedId={copiedId}
          onCopy={handleCopy}
          onToggleAnalytics={toggleAnalytics}
        />
      ) : view === "scroll" ? (
        <HorizontalScroller itemCount={publishedProjects.length}>
          {publishedProjects.map((project) => (
            <PublishedVideoCard key={project.id} {...cardProps(project)} />
          ))}
        </HorizontalScroller>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {publishedProjects.map((project) => (
            <PublishedVideoCard key={project.id} {...cardProps(project)} />
          ))}
        </div>
      )}

      {/* Single full-width analytics panel — shared by every view mode so the
          dashboard renders the same way whether the user expanded a card, a
          scroller cell, or a table row. */}
      {expanded && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <CardTitle className="text-base truncate">
              {expanded.title} — analytics
            </CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setExpandedVideoId(null)}
              aria-label="Close analytics"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
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
                projectId={expanded.id}
                mediaKind={expanded.mediaKind ?? "video"}
                videoDurationSec={expanded.script?.video?.duration}
              />
            </Suspense>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Visibility + status badges shared by the card and table rows. */
function StatusBadges({ project }: { project: StudioProject }) {
  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={
          project.status === StudioProjectStatus.Published ? "default" : "secondary"
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
  );
}

/** Single published-video card — used by the Grid and Scroll layouts. */
function PublishedVideoCard({
  project,
  copied,
  expanded,
  onCopy,
  onToggleAnalytics,
}: {
  project: StudioProject;
  copied: boolean;
  expanded: boolean;
  onCopy: () => void;
  onToggleAnalytics: () => void;
}) {
  return (
    <Card className={cn(expanded && "ring-1 ring-brand-purple")}>
      <CardHeader className="pb-3">
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
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{project.title}</CardTitle>
            <div className="mt-1">
              <StatusBadges project={project} />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" /> {project.viewCount ?? 0} views
              </span>
              <span className="flex items-center gap-1">
                <MousePointer className="w-3 h-3" /> {project.ctaClickCount ?? 0} clicks
              </span>
              <span>{new Date(project.creationDateTime).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCopy}>
            {copied ? (
              <><Check className="w-3 h-3 mr-1 text-emerald-600" /> Copied</>
            ) : (
              <><Link2 className="w-3 h-3 mr-1" /> Copy Link</>
            )}
          </Button>
          <SocialShareRow url={publicUrlFor(project)} title={project.title} />
          <Button
            size="sm"
            variant={expanded ? "default" : "ghost"}
            className="h-7 text-xs"
            onClick={onToggleAnalytics}
          >
            <BarChart3 className="w-3 h-3 mr-1" />
            Analytics
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

/** Dense table layout — one row per published video. */
function PublishedVideoTable({
  projects,
  copiedId,
  onCopy,
  onToggleAnalytics,
}: {
  projects: StudioProject[];
  copiedId: string | null;
  onCopy: (id: string, url: string) => void;
  onToggleAnalytics: (id: string) => void;
}) {
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Views</th>
            <th className="px-3 py-2 font-medium">Clicks</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr
              key={project.id}
              className="border-b border-border last:border-0 hover:bg-muted/30"
            >
              <td className="px-3 py-2 font-medium max-w-[260px] truncate">
                {project.title}
              </td>
              <td className="px-3 py-2"><StatusBadges project={project} /></td>
              <td className="px-3 py-2 text-muted-foreground">{project.viewCount ?? 0}</td>
              <td className="px-3 py-2 text-muted-foreground">{project.ctaClickCount ?? 0}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {new Date(project.creationDateTime).toLocaleDateString()}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onCopy(project.id, publicUrlFor(project))}
                  >
                    {copiedId === project.id ? (
                      <><Check className="w-3 h-3 mr-1 text-emerald-600" /> Copied</>
                    ) : (
                      <><Link2 className="w-3 h-3 mr-1" /> Copy Link</>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => onToggleAnalytics(project.id)}
                  >
                    <BarChart3 className="w-3 h-3 mr-1" />
                    Analytics
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ContentTab;

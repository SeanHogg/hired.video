import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  Loader2,
  Video,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Star,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { apiClient } from "@/lib/api-client";

interface VideoRecord {
  id: string;
  title: string | null;
  status: string;
  videoUrl: string | null;
  youtubeVideoId: string | null;
  thumbnailUrl: string | null;
  privacyStatus: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  isOrphan: boolean;
  createdAt: string;
}

interface StudioProjectRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  title: string;
  status: string;
  purpose: string | null;
  videoId: string | null;
  linkedVideoUrl: string | null;
  linkedVideoStatus: string | null;
  linkedVideoPrivacy: string | null;
  userVideos: VideoRecord[];
  createdAt: string;
  updatedAt: string;
}

interface StudioResponse {
  projects: StudioProjectRow[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total: number;
    draft: number;
    published: number;
    failed: number;
    totalVideos: number;
    orphanedVideos: number;
  };
}

// Inline preview cell for the admin video table. Shows the stored
// thumbnail with a play overlay; clicking pops the actual video into a
// modal so the admin can verify what they're about to feature without
// leaving the page. Self-gating per the DRY rule — the cell decides
// whether to render an image, a generic film icon, or a YouTube
// thumbnail, the consumer just passes the row.
function VideoPreviewCell({ video }: { video: VideoRecord }) {
  const [open, setOpen] = useState(false);
  // YouTube thumbnail fallback: when a video came from a YouTube ingest
  // we don't always have a stored thumbnailUrl, but YouTube serves a
  // predictable poster URL we can read.
  const poster =
    video.thumbnailUrl ??
    (video.youtubeVideoId
      ? `https://i.ytimg.com/vi/${video.youtubeVideoId}/mqdefault.jpg`
      : null);
  const hasPlayable = Boolean(video.videoUrl || video.youtubeVideoId);

  return (
    <>
      <button
        type="button"
        className="relative w-24 h-14 rounded-md overflow-hidden bg-muted ring-1 ring-border group disabled:cursor-default"
        onClick={() => hasPlayable && setOpen(true)}
        disabled={!hasPlayable}
        aria-label={hasPlayable ? `Preview ${video.title ?? video.id.slice(0, 8)}` : "No video available"}
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-muted-foreground">
            <Video className="h-5 w-5" />
          </div>
        )}
        {hasPlayable && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
            <Play className="h-4 w-4 text-white fill-white" />
          </div>
        )}
      </button>

      {open && hasPlayable && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl aspect-video bg-black rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {video.youtubeVideoId ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${video.youtubeVideoId}?autoplay=1`}
                className="w-full h-full"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title={video.title ?? "Video preview"}
              />
            ) : (
              <video
                src={video.videoUrl ?? undefined}
                poster={poster ?? undefined}
                controls
                autoPlay
                className="w-full h-full"
              />
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft:      "bg-yellow-100 text-yellow-800",
  pending:    "bg-gray-200 text-gray-800",
  processing: "bg-blue-100 text-blue-800",
  exported:   "bg-indigo-100 text-indigo-800",
  published:  "bg-green-100 text-green-800",
  Completed:  "bg-green-100 text-green-800",
  Queued:     "bg-gray-200 text-gray-800",
  failed:     "bg-red-100 text-red-800",
  Failed:     "bg-red-100 text-red-800",
};

export default function StudioManagement() {
  const { t } = useTranslation();
  const PURPOSE_LABELS: Record<string, string> = {
    resume:          t("labels.resume"),
    job_ad:          t("labels.purposeJobAd"),
    company_promo:   t("labels.purposeCompanyPromo"),
    recruiter_brand: t("labels.purposeRecruiterBrand"),
    product_launch:  t("labels.purposeProductLaunch"),
    personal_brand:  t("labels.purposePersonalBrand"),
  };
  const [projects, setProjects] = useState<StudioProjectRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total: 0, draft: 0, published: 0, failed: 0, totalVideos: 0, orphanedVideos: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<StudioProjectRow | null>(null);
  const [confirmDeleteVideo, setConfirmDeleteVideo] = useState<VideoRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<string>("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const { toast } = useToast();
  const { can } = useAdminPermissions();

  const canDelete = can("studio", "delete");

  const limit = 50;

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiClient.get<StudioResponse>(
        `/api/admin/studio/projects?${params.toString()}`
      );
      setProjects(res.data.projects ?? []);
      setTotal(res.data.total ?? 0);
      setSummary(res.data.summary ?? { total: 0, draft: 0, published: 0, failed: 0, totalVideos: 0, orphanedVideos: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadProjects"));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, t]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (project: StudioProjectRow) => {
    try {
      await apiClient.delete(`/api/admin/studio/projects/${project.id}`);
      toast({ title: t("messages.deletedTitle", { title: project.title }) });
      setConfirmDelete(null);
      loadProjects();
    } catch {
      toast({ title: t("errors.failedToDeleteProject"), variant: "destructive" });
    }
  };

  const handleDeleteVideo = async (video: VideoRecord) => {
    try {
      await apiClient.delete(`/api/admin/studio/videos/${video.id}`);
      toast({ title: t("messages.deletedVideoTitle", { title: video.title || video.id.slice(0, 8) }) });
      setConfirmDeleteVideo(null);
      loadProjects();
    } catch {
      toast({ title: t("errors.failedToDeleteVideo"), variant: "destructive" });
    }
  };

  // Toggle the homepage-hero singleton on this video. Server-side the
  // partial unique index guarantees only one row is featured at a time
  // (PATCH atomically rolls off any sibling), so optimistic UI just
  // mirrors that — we flip everything else off locally so the star
  // doesn't appear in two rows mid-reload.
  const handleToggleFeatured = async (video: VideoRecord) => {
    const next = !video.isFeatured;
    setProjects((prev) =>
      prev.map((p) => ({
        ...p,
        userVideos: p.userVideos.map((v) =>
          v.id === video.id
            ? { ...v, isFeatured: next }
            : next
              ? { ...v, isFeatured: false }
              : v,
        ),
      })),
    );
    try {
      await apiClient.patch(`/api/admin/studio/videos/${video.id}/featured`, { isFeatured: next });
      toast({
        title: next
          ? t("messages.videoFeaturedOn", { defaultValue: "Featured on homepage" })
          : t("messages.videoFeaturedOff", { defaultValue: "Removed from homepage hero" }),
      });
    } catch {
      toast({
        title: t("errors.failedToToggleFeatured", { defaultValue: "Failed to update featured flag" }),
        variant: "destructive",
      });
      loadProjects();
    }
  };

  // Clear selection when the visible page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, statusFilter]);

  const allVisibleSelected =
    projects.length > 0 && projects.every((p) => selectedIds.has(p.id));
  const someVisibleSelected =
    projects.some((p) => selectedIds.has(p.id)) && !allVisibleSelected;

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        projects.forEach((p) => next.add(p.id));
      } else {
        projects.forEach((p) => next.delete(p.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleApplyBulkAction = () => {
    if (!bulkAction || selectedIds.size === 0) return;
    if (bulkAction === "delete") {
      setConfirmBulkDelete(true);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) => apiClient.delete(`/api/admin/studio/projects/${id}`)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    if (succeeded > 0) {
      toast({
        title: t("messages.deletedProjectsCount", { count: succeeded }),
        ...(failed > 0
          ? { description: t("messages.bulkDeletedFailedSuffix", { count: failed }) }
          : {}),
      });
    }
    if (succeeded === 0 && failed > 0) {
      toast({
        title: t("errors.failedToDeleteProjectsCount", { count: failed }),
        variant: "destructive",
      });
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setBulkAction("");
    setSelectedIds(new Set());
    loadProjects();
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("headings.studioManagement")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("messages.studioManagementIntro")}
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{summary.total}</span> {t("labels.totalProjectsCount", { count: summary.total }).split(" ").slice(1).join(" ")}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: t("labels.projectsCard"),  count: summary.total,           color: "text-foreground" },
          { label: t("status.publishedStatus"), count: summary.published,    color: "text-green-600" },
          { label: t("status.draftStatus"),  count: summary.draft,            color: "text-yellow-600" },
          { label: t("labels.failedCard"),   count: summary.failed,           color: "text-red-600" },
          { label: t("labels.videosColumn"), count: summary.totalVideos,      color: "text-blue-600" },
          { label: t("labels.orphaned"),     count: summary.orphanedVideos,   color: summary.orphanedVideos > 0 ? "text-orange-600" : "text-muted-foreground" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orphan warning banner */}
      {summary.orphanedVideos > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t("messages.studioOrphanWarning", { count: summary.orphanedVideos })}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("messages.searchByProjectUserEmail")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder={t("labels.callStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("labels.allStatuses")}</SelectItem>
            <SelectItem value="draft">{t("status.draftStatus")}</SelectItem>
            <SelectItem value="pending">{t("metrics.pending")}</SelectItem>
            <SelectItem value="processing">{t("labels.processing")}</SelectItem>
            <SelectItem value="exported">Exported</SelectItem>
            <SelectItem value="published">{t("status.publishedStatus")}</SelectItem>
            <SelectItem value="failed">{t("labels.failedCard")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadProjects}>
            {t("actions.retry")}
          </Button>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {t("labels.selectedCount", { count: selectedIds.size })}
          </span>
          <Select value={bulkAction} onValueChange={setBulkAction}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder={t("actions.bulkAction")} />
            </SelectTrigger>
            <SelectContent>
              {canDelete && <SelectItem value="delete">{t("actions.deleteAdmin")}</SelectItem>}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!bulkAction}
            onClick={handleApplyBulkAction}
          >
            {t("labels.apply")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedIds(new Set());
              setBulkAction("");
            }}
          >
            {t("actions.clear")}
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allVisibleSelected
                      ? true
                      : someVisibleSelected
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(v) => toggleAllVisible(v === true)}
                  aria-label="Select all projects on this page"
                />
              </TableHead>
              <TableHead className="w-8" />
              <TableHead>{t("labels.projectColumn")}</TableHead>
              <TableHead>{t("labels.ownerColumn")}</TableHead>
              <TableHead>{t("labels.purpose")}</TableHead>
              <TableHead>{t("labels.callStatus")}</TableHead>
              <TableHead>{t("labels.videoUrl")}</TableHead>
              <TableHead>{t("labels.videosColumn")}</TableHead>
              <TableHead>{t("labels.updated")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingProjects")}
                </TableCell>
              </TableRow>
            ) : projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {t("messages.noProjectsMatch")}
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => {
                const isExpanded = expandedIds.has(project.id);
                const orphanCount = project.userVideos.filter((v) => v.isOrphan).length;
                return (
                  <React.Fragment key={project.id}>
                    <TableRow data-state={selectedIds.has(project.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(project.id)}
                          onCheckedChange={(v) => toggleOne(project.id, v === true)}
                          aria-label={`Select ${project.title}`}
                        />
                      </TableCell>
                      <TableCell className="px-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => toggleExpanded(project.id)}
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground shrink-0" />
                          <p className="font-medium text-sm truncate max-w-[200px]">{project.title}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="font-medium">{project.userName ?? "—"}</p>
                          <p className="text-muted-foreground text-xs">{project.userEmail ?? ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {project.purpose ? (PURPOSE_LABELS[project.purpose] ?? project.purpose) : "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[project.status] ?? "bg-gray-100 text-gray-800"}`}
                        >
                          {project.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {project.linkedVideoUrl ? (
                          <a
                            href={project.linkedVideoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline truncate max-w-[180px]"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{project.linkedVideoUrl.replace(/^https?:\/\//, "").slice(0, 40)}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("labels.none")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="font-medium">{project.userVideos.length}</span>
                        {orphanCount > 0 && (
                          <span className="ml-1 text-orange-600 text-xs font-medium">
                            {t("labels.orphanCountSuffix", { count: orphanCount })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/admin/users">
                                <Eye className="h-4 w-4 mr-2" />
                                {t("actions.viewOwner")}
                              </Link>
                            </DropdownMenuItem>
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onSelect={() => setConfirmDelete(project)}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  {t("actions.deleteProject")}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {/* Expanded video detail rows */}
                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/40">
                        <TableCell colSpan={10} className="p-0">
                          <div className="px-6 py-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              {t("labels.allVideosFor", { name: project.userName, count: project.userVideos.length })}
                            </p>
                            {project.userVideos.length === 0 ? (
                              <p className="text-sm text-muted-foreground">{t("messages.noVideoRecordsForUser")}</p>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b">
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.preview", { defaultValue: "Preview" })}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.callStatus")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.title")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.videoUrl")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("tabs.privacy")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.linkColumn")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.created")}</th>
                                    <th className="text-left py-1 pr-3 font-medium">{t("labels.homepageFeatured", { defaultValue: "Homepage" })}</th>
                                    <th className="text-left py-1 font-medium w-8" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {project.userVideos.map((v) => (
                                    <tr
                                      key={v.id}
                                      className={`border-b last:border-0 ${v.isOrphan ? "bg-orange-50" : v.isFeatured ? "bg-amber-50/60" : ""}`}
                                    >
                                      <td className="py-1.5 pr-3 align-middle">
                                        <VideoPreviewCell video={v} />
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <span
                                          className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[v.status] ?? "bg-gray-100 text-gray-800"}`}
                                        >
                                          {v.status}
                                        </span>
                                      </td>
                                      <td className="py-1.5 pr-3 text-muted-foreground truncate max-w-[120px]">
                                        {v.title || "—"}
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        {v.videoUrl ? (
                                          <a
                                            href={v.videoUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                          >
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                            <span className="truncate max-w-[200px] inline-block align-bottom">
                                              {v.videoUrl.replace(/^https?:\/\//, "").slice(0, 50)}
                                            </span>
                                          </a>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-3 text-muted-foreground text-xs">
                                        {v.privacyStatus ?? "—"}
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        {v.isOrphan ? (
                                          <span className="inline-flex items-center gap-1 text-orange-600 text-xs font-medium">
                                            <AlertTriangle className="h-3 w-3" />
                                            {t("labels.orphanStatus")}
                                          </span>
                                        ) : v.id === project.videoId ? (
                                          <span className="text-green-600 text-xs font-medium">{t("labels.linkedStatus")}</span>
                                        ) : (
                                          <span className="text-muted-foreground text-xs">{t("labels.otherProject")}</span>
                                        )}
                                      </td>
                                      <td className="py-1.5 pr-3 text-muted-foreground text-xs">
                                        {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "—"}
                                      </td>
                                      <td className="py-1.5 pr-3">
                                        <Button
                                          variant={v.isFeatured ? "default" : "ghost"}
                                          size="sm"
                                          className={`h-7 gap-1 ${v.isFeatured ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-muted-foreground hover:text-amber-600"}`}
                                          onClick={() => handleToggleFeatured(v)}
                                          disabled={v.privacyStatus !== "public" && !v.isFeatured}
                                          title={
                                            v.privacyStatus !== "public" && !v.isFeatured
                                              ? t("messages.featureRequiresPublic", { defaultValue: "Video must be public to feature on homepage" })
                                              : v.isFeatured
                                                ? t("actions.unfeature", { defaultValue: "Remove from homepage hero" })
                                                : t("actions.featureOnHomepage", { defaultValue: "Set as homepage hero" })
                                          }
                                        >
                                          <Star className={`h-3.5 w-3.5 ${v.isFeatured ? "fill-current" : ""}`} />
                                          {v.isFeatured ? t("labels.featured", { defaultValue: "Featured" }) : t("actions.feature", { defaultValue: "Feature" })}
                                        </Button>
                                      </td>
                                      <td className="py-1.5">
                                        {canDelete && (
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-destructive hover:text-destructive"
                                            onClick={() => setConfirmDeleteVideo(v)}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("labels.pageOfWithProjects", { page, totalPages, total })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("actions.previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("actions.next")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete project confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("messages.confirmDeleteProject")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.confirmDeleteProjectBody", { title: confirmDelete?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              {t("actions.deleteAdmin")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete video confirmation */}
      <AlertDialog
        open={!!confirmDeleteVideo}
        onOpenChange={(open) => !open && setConfirmDeleteVideo(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("messages.confirmDeleteVideo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.confirmDeleteVideoBodyBase", { title: confirmDeleteVideo?.title || confirmDeleteVideo?.id.slice(0, 8) || "" })}
              {confirmDeleteVideo?.videoUrl && t("messages.confirmDeleteVideoUrlSuffix")}
              {!confirmDeleteVideo?.isOrphan && t("messages.confirmDeleteVideoUnlinkSuffix")}
              {t("messages.confirmDeleteVideoActionUndoSuffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDeleteVideo && handleDeleteVideo(confirmDeleteVideo)}
            >
              {t("actions.deleteVideo")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={confirmBulkDelete}
        onOpenChange={(open) => !open && !bulkDeleting && setConfirmBulkDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("messages.confirmDeleteProjectsTitle", { count: selectedIds.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.confirmDeleteProjectsBody", { count: selectedIds.size })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleting}
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
            >
              {bulkDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("status.deleting")}
                </>
              ) : (
                t("actions.deleteAdmin")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

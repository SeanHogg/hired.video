import React, { useState, useEffect, useCallback } from "react";
import { publicJobPath, publicProfilePath } from "@shared/public-paths";
import { useIdSelection } from "@/hooks/use-id-selection";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Loader2,
  Plus,
  Briefcase,
  MapPin,
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
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { userService, type UserProfile } from "@/lib/services/user-service";
import { studioNewEntityHref } from "@/lib/studio/studio-authoring";

const STATUS_COLORS: Record<string, string> = {
  Open:   "bg-green-100 text-green-800",
  Draft:  "bg-yellow-100 text-yellow-800",
  Closed: "bg-muted text-foreground",
  Hired:  "bg-accent text-accent-foreground",
};

function formatSalary(min?: number, max?: number): string {
  if (!min && !max) return "—";
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}

export default function JobsManagement() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState<JobSummary | null>(null);
  const selection = useIdSelection([page, search, employmentType]);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});
  const { toast } = useToast();
  const { can } = useAdminPermissions();

  const canCreate = can("jobs", "create");
  const canUpdate = can("jobs", "update");
  const canDelete = can("jobs", "delete");

  const limit = 50;

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await jobService.getPublicJobs({
        page,
        limit,
        ...(search ? { search } : {}),
        ...(employmentType !== "all" ? { employmentType } : {}),
      });
      setJobs(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadJobsAdmin"));
    } finally {
      setLoading(false);
    }
  }, [page, search, employmentType, t]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Load user profiles for jobs that have a creator we haven't fetched yet.
  useEffect(() => {
    const ids = Array.from(
      new Set(
        jobs
          .map((j) => (j as any).createdBy as string | undefined)
          .filter((id): id is string => !!id && !users[id]),
      ),
    );
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.allSettled(ids.map((id) => userService.getUserById(id))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, UserProfile> = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") next[ids[i]] = r.value;
        });
        if (Object.keys(next).length > 0) {
          setUsers((prev) => ({ ...prev, ...next }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [jobs, users]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleDelete = async (job: JobSummary) => {
    try {
      await jobService.deleteJob(job.id);
      toast({ title: t("messages.deletedTitle", { title: job.title }) });
      setConfirmDelete(null);
      loadJobs();
    } catch {
      toast({ title: t("errors.failedToDeleteJob"), variant: "destructive" });
    }
  };

  const handleApplyBulkAction = () => {
    if (!bulkAction || selection.size === 0) return;
    if (bulkAction === "delete") {
      setConfirmBulkDelete(true);
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = selection.ids;
    const results = await Promise.allSettled(
      ids.map((id) => jobService.deleteJob(id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    if (succeeded > 0) {
      toast({
        title: t("messages.deletedJobsCount", { count: succeeded }),
        ...(failed > 0
          ? { description: t("messages.bulkDeletedFailedSuffix", { count: failed }) }
          : {}),
      });
    }
    if (succeeded === 0 && failed > 0) {
      toast({
        title: t("errors.failedToDeleteJobsCount", { count: failed }),
        variant: "destructive",
      });
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setBulkAction("");
    selection.clear();
    loadJobs();
  };

  const totalPages = Math.ceil(total / limit);
  const openCount = jobs.filter((j: any) => (j.status ?? "Open") === "Open").length;
  const draftCount = jobs.filter((j: any) => j.status === "Draft").length;
  const remoteCount = jobs.filter((j) => j.isRemote).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("headings.jobsManagement")}</h1>
          <p className="text-muted-foreground text-sm">
            {t("messages.jobsManagementIntro")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span> {t("labels.totalJobsCount", { count: total }).split(" ").slice(1).join(" ")}
          </span>
          {canCreate && (
            <Button size="sm" asChild>
              <Link to={studioNewEntityHref("job")}>
                <Plus className="h-4 w-4 mr-1" />
                {t("actions.newJob")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("labels.total"),     count: total,       color: "text-foreground" },
          { label: t("labels.jobOpen"),   count: openCount,   color: "text-green-600" },
          { label: t("status.draftStatus"), count: draftCount,  color: "text-yellow-600" },
          { label: t("labels.remote"),    count: remoteCount, color: "text-primary" },
        ].map(({ label, count, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("messages.searchByTitleCompanyLocation")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={employmentType}
          onValueChange={(v) => {
            setEmploymentType(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <Filter className="h-3 w-3 mr-1" />
            <SelectValue placeholder={t("labels.jobType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("labels.allTypes")}</SelectItem>
            <SelectItem value="FullTime">{t("labels.fullTime")}</SelectItem>
            <SelectItem value="PartTime">{t("labels.partTime")}</SelectItem>
            <SelectItem value="Contractor">{t("labels.contractor")}</SelectItem>
            <SelectItem value="Freelance">{t("labels.freelance")}</SelectItem>
            <SelectItem value="Internship">{t("labels.internship")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadJobs}>
            {t("actions.retry")}
          </Button>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selection.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {t("labels.selectedCount", { count: selection.size })}
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
              selection.clear();
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
                  checked={selection.headerState(jobs.map((j) => j.id))}
                  onCheckedChange={(v) => selection.setMany(jobs.map((j) => j.id), v === true)}
                  aria-label="Select all jobs on this page"
                />
              </TableHead>
              <TableHead>{t("labels.jobLabel")}</TableHead>
              <TableHead>{t("fields.company.label")}</TableHead>
              <TableHead>{t("fields.location.label")}</TableHead>
              <TableHead>{t("labels.jobType")}</TableHead>
              <TableHead>{t("labels.salary")}</TableHead>
              <TableHead>{t("labels.callStatus")}</TableHead>
              <TableHead>{t("labels.postedBy")}</TableHead>
              <TableHead>{t("labels.posted")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingJobsAdmin")}
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  {t("messages.noJobsMatch")}
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const status = (job as any).status ?? "Open";
                const posted = job.postedDate ?? job.createdAt;
                const creatorId = (job as any).createdBy as string | undefined;
                const creator = creatorId ? users[creatorId] : undefined;
                const creatorName = creator
                  ? [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim() ||
                    creator.email ||
                    "User"
                  : null;
                return (
                  <TableRow key={job.id} data-state={selection.isSelected(job.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selection.isSelected(job.id)}
                        onCheckedChange={(v) => selection.toggle(job.id, v === true)}
                        aria-label={`Select ${job.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <Link
                          to={publicJobPath(job.id)}
                          className="font-medium text-sm text-primary hover:underline"
                        >
                          {job.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{job.company ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location}
                        </span>
                      ) : (
                        "—"
                      )}
                      {job.isRemote && (
                        <span className="ml-2 text-xs text-primary">{t("labels.remote")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {job.employmentType ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatSalary(job.salaryMin, job.salaryMax)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? ""}`}
                      >
                        {status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {creatorId ? (
                        creator ? (
                          <Link
                            to={
                              creator.slug
                                ? publicProfilePath(creator.slug)
                                : publicProfilePath(creatorId)
                            }
                            className="text-primary hover:underline"
                          >
                            {creatorName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">{t("status.loadingEllipsis")}</span>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {posted ? new Date(posted).toLocaleDateString() : "—"}
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
                            <Link to={publicJobPath(job.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              {t("actions.view")}
                            </Link>
                          </DropdownMenuItem>
                          {canUpdate && (
                            <DropdownMenuItem asChild>
                              <Link to={`${publicJobPath(job.id)}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                {t("actions.edit")}
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setConfirmDelete(job)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {t("actions.deleteAdmin")}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
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
            {t("labels.pageOfWithJobs", { page, totalPages, total })}
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

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("messages.confirmDeleteJob")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.confirmDeleteJobBody", { title: confirmDelete?.title ?? "" })}
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

      {/* Bulk delete confirmation */}
      <AlertDialog
        open={confirmBulkDelete}
        onOpenChange={(open) => !open && !bulkDeleting && setConfirmBulkDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("messages.confirmDeleteJobsTitle", { count: selection.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.confirmDeleteJobsBody", { count: selection.size })}
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

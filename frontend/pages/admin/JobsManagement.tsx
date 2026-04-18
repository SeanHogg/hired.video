import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
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

const STATUS_COLORS: Record<string, string> = {
  Open:   "bg-green-100 text-green-800",
  Draft:  "bg-yellow-100 text-yellow-800",
  Closed: "bg-gray-200 text-gray-800",
  Hired:  "bg-blue-100 text-blue-800",
};

function formatSalary(min?: number, max?: number): string {
  if (!min && !max) return "—";
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max)!);
}

export default function JobsManagement() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [employmentType, setEmploymentType] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState<JobSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
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
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [page, search, employmentType]);

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
      toast({ title: `Deleted "${job.title}"` });
      setConfirmDelete(null);
      loadJobs();
    } catch {
      toast({ title: "Failed to delete job", variant: "destructive" });
    }
  };

  // Clear selection when the visible page of jobs changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, search, employmentType]);

  const allVisibleSelected =
    jobs.length > 0 && jobs.every((j) => selectedIds.has(j.id));
  const someVisibleSelected =
    jobs.some((j) => selectedIds.has(j.id)) && !allVisibleSelected;

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        jobs.forEach((j) => next.add(j.id));
      } else {
        jobs.forEach((j) => next.delete(j.id));
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
      ids.map((id) => jobService.deleteJob(id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = ids.length - failed;
    if (succeeded > 0) {
      toast({
        title: `Deleted ${succeeded} job${succeeded === 1 ? "" : "s"}`,
        ...(failed > 0
          ? { description: `${failed} failed to delete.` }
          : {}),
      });
    }
    if (succeeded === 0 && failed > 0) {
      toast({
        title: `Failed to delete ${failed} job${failed === 1 ? "" : "s"}`,
        variant: "destructive",
      });
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    setBulkAction("");
    setSelectedIds(new Set());
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
          <h1 className="text-2xl font-bold">Jobs Management</h1>
          <p className="text-muted-foreground text-sm">
            View, edit, and manage all jobs across the platform.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span> total jobs
          </span>
          {canCreate && (
            <Button size="sm" asChild>
              <Link to="/jobs/create">
                <Plus className="h-4 w-4 mr-1" />
                New Job
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",  count: total,       color: "text-foreground" },
          { label: "Open",   count: openCount,   color: "text-green-600" },
          { label: "Draft",  count: draftCount,  color: "text-yellow-600" },
          { label: "Remote", count: remoteCount, color: "text-blue-600" },
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
            placeholder="Search by title, company, or location..."
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
            <SelectValue placeholder="Employment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="FullTime">Full Time</SelectItem>
            <SelectItem value="PartTime">Part Time</SelectItem>
            <SelectItem value="Contractor">Contractor</SelectItem>
            <SelectItem value="Freelance">Freelance</SelectItem>
            <SelectItem value="Internship">Internship</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadJobs}>
            Retry
          </Button>
        </div>
      )}

      {/* Bulk actions toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Select value={bulkAction} onValueChange={setBulkAction}>
            <SelectTrigger className="w-[180px] h-8">
              <SelectValue placeholder="Bulk action..." />
            </SelectTrigger>
            <SelectContent>
              {canDelete && <SelectItem value="delete">Delete</SelectItem>}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!bulkAction}
            onClick={handleApplyBulkAction}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedIds(new Set());
              setBulkAction("");
            }}
          >
            Clear
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
                  aria-label="Select all jobs on this page"
                />
              </TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Posted By</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  Loading jobs...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  No jobs match your filters.
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
                  <TableRow key={job.id} data-state={selectedIds.has(job.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(job.id)}
                        onCheckedChange={(v) => toggleOne(job.id, v === true)}
                        aria-label={`Select ${job.title}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-muted-foreground" />
                        <Link
                          to={`/jobs/${job.id}`}
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
                        <span className="ml-2 text-xs text-blue-600">Remote</span>
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
                                ? `/people/${creator.slug}`
                                : `/people/${creatorId}`
                            }
                            className="text-primary hover:underline"
                          >
                            {creatorName}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Loading…</span>
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
                            <Link to={`/jobs/${job.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </Link>
                          </DropdownMenuItem>
                          {canUpdate && (
                            <DropdownMenuItem asChild>
                              <Link to={`/jobs/${job.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
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
                                Delete
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
            Page {page} of {totalPages} ({total} jobs)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
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
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold">"{confirmDelete?.title}"</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
            >
              Delete
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
              Delete {selectedIds.size} job{selectedIds.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the selected job
              {selectedIds.size === 1 ? "" : "s"}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting}>Cancel</AlertDialogCancel>
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
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

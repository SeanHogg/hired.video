/**
 * JobBoardsTab — distribute your jobs across external boards, see per-posting
 * performance, and remove stale postings. Stats cards summarise board-wide
 * performance; the table below is filterable by job / board / status.
 */
import {
  BarChart3,
  ExternalLink,
  Plus,
  Target,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import { KpiCard } from "@/components/outreach/shared/KpiCard";
import type {
  JobBoardDTO,
  JobBoardPostingDTO,
  JobBoardStatsDTO,
} from "@/lib/services/job-board-service";
import { confirmDialog } from "@/lib/dialogs";
import type { JobSummary } from "@/lib/services/job-service";

export interface PostingFilters {
  jobId: string;
  boardId: string;
  status: string;
}

export interface JobBoardsTabProps {
  jobBoards: JobBoardDTO[];
  jobBoardPostings: JobBoardPostingDTO[];
  jobBoardStats: JobBoardStatsDTO | null;
  userJobs: JobSummary[];
  postingFilters: PostingFilters;
  onPostingFiltersChange: (filters: PostingFilters) => void;
  onOpenPostDialog: () => void;
  onRemovePosting: (id: string) => Promise<void>;
}

export function JobBoardsTab({
  jobBoards,
  jobBoardPostings,
  jobBoardStats,
  userJobs,
  postingFilters,
  onPostingFiltersChange,
  onOpenPostDialog,
  onRemovePosting,
}: JobBoardsTabProps) {
  const filtersActive =
    postingFilters.jobId !== "all" ||
    postingFilters.boardId !== "all" ||
    postingFilters.status !== "all";

  const visiblePostings = jobBoardPostings.filter((posting) => {
    if (postingFilters.jobId !== "all" && posting.jobId !== postingFilters.jobId)
      return false;
    if (
      postingFilters.boardId !== "all" &&
      posting.jobBoardId !== postingFilters.boardId
    )
      return false;
    if (postingFilters.status !== "all" && posting.status !== postingFilters.status)
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Job Board Distribution</h2>
        <Button onClick={onOpenPostDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Post to Boards
        </Button>
      </div>

      {jobBoardStats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <KpiCard
            title="Total Postings"
            icon={Target}
            value={jobBoardStats.totalPostings}
          />
          <KpiCard
            title="Active Postings"
            icon={Zap}
            value={jobBoardStats.activePostings}
          />
          <KpiCard
            title="Total Views"
            icon={BarChart3}
            value={jobBoardStats.totalViews}
          />
          <KpiCard
            title="Applications"
            icon={Users}
            value={jobBoardStats.totalApplications}
          />
          <KpiCard
            title="Total Cost"
            icon={Target}
            value={`$${jobBoardStats.totalCost.toFixed(2)}`}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active Postings</CardTitle>
          <CardDescription>
            Manage your job postings across multiple boards
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <Label htmlFor="filter-job">Filter by Job</Label>
              <Select
                value={postingFilters.jobId}
                onValueChange={(value) =>
                  onPostingFiltersChange({ ...postingFilters, jobId: value })
                }
              >
                <SelectTrigger id="filter-job">
                  <SelectValue placeholder="All Jobs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jobs</SelectItem>
                  {userJobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filter-board">Filter by Board</Label>
              <Select
                value={postingFilters.boardId}
                onValueChange={(value) =>
                  onPostingFiltersChange({ ...postingFilters, boardId: value })
                }
              >
                <SelectTrigger id="filter-board">
                  <SelectValue placeholder="All Boards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Boards</SelectItem>
                  {jobBoards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="filter-status">Filter by Status</Label>
              <Select
                value={postingFilters.status}
                onValueChange={(value) =>
                  onPostingFiltersChange({ ...postingFilters, status: value })
                }
              >
                <SelectTrigger id="filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Posted">Posted</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                  <SelectItem value="Removed">Removed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtersActive && (
            <div className="mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onPostingFiltersChange({
                    jobId: "all",
                    boardId: "all",
                    status: "all",
                  })
                }
              >
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>

        <CardContent>
          {jobBoardPostings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Board</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Applications</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePostings.map((posting) => (
                  <TableRow key={posting.id}>
                    <TableCell className="font-medium">
                      {posting.jobTitle}
                    </TableCell>
                    <TableCell>{posting.jobBoardName}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          posting.status === "Active"
                            ? "default"
                            : posting.status === "Pending"
                              ? "secondary"
                              : posting.status === "Expired"
                                ? "outline"
                                : "destructive"
                        }
                      >
                        {posting.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(posting.postedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{posting.views}</TableCell>
                    <TableCell>{posting.applications}</TableCell>
                    <TableCell>
                      {posting.cost ? `$${posting.cost.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {posting.externalUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(posting.externalUrl!, "_blank")
                            }
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (
                              await confirmDialog({
                                title: "Remove posting",
                                description:
                                  "Are you sure you want to remove this posting?",
                                confirmText: "Remove",
                                destructive: true,
                              })
                            ) {
                              await onRemovePosting(posting.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={Target}
              title="No job board postings yet"
              description="Post your jobs to multiple boards to reach more candidates"
              action={
                <Button onClick={onOpenPostDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Post to Boards
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default JobBoardsTab;

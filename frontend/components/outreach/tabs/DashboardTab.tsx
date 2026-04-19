/**
 * DashboardTab — at-a-glance overview:
 *   • Inbox Snapshot (cards jump to Inbox tab)
 *   • Communication stats KPIs
 *   • Job board performance (when we have postings)
 *   • Quick actions + recent activity
 *
 * Purely presentational — all data and callbacks flow in as props.
 */
import {
  BarChart3,
  Bell,
  Clock,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  Send,
  Target,
  UserPlus,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/outreach/shared/KpiCard";
import type { useCommHub } from "@/hooks/use-comm-hub";
import type { JobBoardStatsDTO } from "@/lib/services/job-board-service";
import type {
  CommunicationStats,
  CommunicationTrackingDTO,
} from "@/types/communication";

export interface DashboardTabProps {
  commHub: ReturnType<typeof useCommHub>;
  communicationStats: CommunicationStats | null;
  communicationTracking: CommunicationTrackingDTO[];
  jobBoardStats: JobBoardStatsDTO | null;
  onGoToInbox: () => void;
  onOpenTemplateDialog: () => void;
  onOpenContactDialog: () => void;
  onOpenJobBoardDialog: () => void;
}

export function DashboardTab({
  commHub,
  communicationStats,
  communicationTracking,
  jobBoardStats,
  onGoToInbox,
  onOpenTemplateDialog,
  onOpenContactDialog,
  onOpenJobBoardDialog,
}: DashboardTabProps) {
  const pendingRequests = commHub.items.filter((i) => i.kind === "request").length;
  const unreadMessages = commHub.items.filter(
    (i) => i.kind === "message" && !i.isRead,
  ).length;
  const newNotifications = commHub.items.filter(
    (i) => i.kind === "notification" && !i.isRead,
  ).length;

  return (
    <div className="space-y-6">
      {/* Inbox Snapshot — every card routes to the Inbox tab. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KpiCard
          title="Pending Requests"
          icon={UserPlus}
          value={pendingRequests}
          caption="Awaiting your response"
          onClick={onGoToInbox}
        />
        <KpiCard
          title="Unread Messages"
          icon={MessageCircle}
          value={unreadMessages}
          caption="Direct messages"
          onClick={onGoToInbox}
        />
        <KpiCard
          title="New Notifications"
          icon={Bell}
          value={newNotifications}
          caption="System updates"
          onClick={onGoToInbox}
        />
      </div>

      {/* Communication KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiCard
          title="Messages Sent"
          icon={Send}
          value={communicationStats?.totalMessages || 0}
          caption="Total messages sent"
        />
        <KpiCard
          title="Response Rate"
          icon={BarChart3}
          value={
            communicationStats?.responseRate
              ? `${Math.round(communicationStats.responseRate * 100)}%`
              : "0%"
          }
          caption="Average response rate"
        />
        <KpiCard
          title="Active Conversations"
          icon={MessageSquare}
          value={communicationStats?.activeConversations || 0}
          caption="Ongoing conversations"
        />
        <KpiCard
          title="Pending Follow-ups"
          icon={Clock}
          value={communicationStats?.pendingFollowUps || 0}
          caption="Require attention"
        />
      </div>

      {/* Job Board Analytics */}
      {jobBoardStats && jobBoardStats.totalPostings > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Job Board Distribution
            </CardTitle>
            <CardDescription>
              Performance metrics across all job boards
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <BoardStat value={jobBoardStats.totalPostings} label="Total Postings" />
              <BoardStat value={jobBoardStats.activePostings} label="Active Postings" />
              <BoardStat value={jobBoardStats.totalViews} label="Total Views" />
              <BoardStat value={jobBoardStats.totalApplications} label="Applications" />
              <BoardStat
                value={`$${jobBoardStats.totalCost.toFixed(2)}`}
                label="Total Cost"
              />
            </div>

            {jobBoardStats.boardPerformance.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">
                  Board Performance Comparison
                </h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Board</TableHead>
                      <TableHead className="text-right">Postings</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Applications</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Cost/App</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobBoardStats.boardPerformance.map((board) => (
                      <TableRow key={board.jobBoardId}>
                        <TableCell className="font-medium">
                          {board.jobBoardName}
                        </TableCell>
                        <TableCell className="text-right">
                          {board.totalPostings}
                        </TableCell>
                        <TableCell className="text-right">
                          {board.totalViews}
                        </TableCell>
                        <TableCell className="text-right">
                          {board.totalApplications}
                        </TableCell>
                        <TableCell className="text-right">
                          ${board.totalCost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {board.averageCostPerApplication > 0
                            ? `$${board.averageCostPerApplication.toFixed(2)}`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={onOpenTemplateDialog}
            >
              <FileText className="h-4 w-4" />
              Create Email Template
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              disabled
            >
              <Mail className="h-4 w-4" />
              Start Email Campaign (Coming Soon)
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={onOpenContactDialog}
            >
              <UserPlus className="h-4 w-4" />
              Add External Contact
            </Button>
            <Button
              className="w-full justify-start gap-3"
              variant="outline"
              onClick={onOpenJobBoardDialog}
            >
              <Target className="h-4 w-4" />
              Post Job to Boards
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {communicationTracking.slice(0, 3).map((tracking) => (
              <div
                key={tracking.id}
                className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    {tracking.subject || "Communication"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {tracking.externalName ||
                      (tracking.targetUser?.firstName || "") +
                        " " +
                        (tracking.targetUser?.lastName || "")}
                  </p>
                </div>
              </div>
            ))}
            {communicationTracking.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No recent activity
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BoardStat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default DashboardTab;

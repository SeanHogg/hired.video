/**
 * TrackingTab — flat table of every communication touch (email, SMS, call…).
 * Read-only; status and channel are rendered as badges for scannability.
 */
import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/outreach/shared/EmptyState";
import {
  CommunicationChannel,
  CommunicationTrackingStatus,
  type CommunicationTrackingDTO,
} from "@/types/communication";

export interface TrackingTabProps {
  communicationTracking: CommunicationTrackingDTO[];
}

export function TrackingTab({ communicationTracking }: TrackingTabProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Communication Tracking</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contact</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Channel</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {communicationTracking.map((tracking) => (
            <TableRow key={tracking.id}>
              <TableCell>
                {tracking.externalName ||
                  (tracking.targetUser
                    ? `${tracking.targetUser.firstName} ${tracking.targetUser.lastName}`
                    : "Unknown")}
              </TableCell>
              <TableCell>{tracking.subject || "No subject"}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {CommunicationChannel[tracking.channel]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    tracking.status === CommunicationTrackingStatus.Replied
                      ? "default"
                      : "secondary"
                  }
                >
                  {CommunicationTrackingStatus[tracking.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {tracking.creationDateTime
                  ? new Date(tracking.creationDateTime).toLocaleDateString()
                  : "Unknown"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {communicationTracking.length === 0 && (
        <EmptyState
          icon={BarChart3}
          title="No communications tracked"
          description="Start sending messages to see tracking data here"
        />
      )}
    </div>
  );
}

export default TrackingTab;

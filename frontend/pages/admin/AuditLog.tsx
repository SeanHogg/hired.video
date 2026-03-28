import React, { useState } from "react";
import { Search, Filter, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";

type Severity = "info" | "warning" | "critical";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail: string;
  action: string;
  target: string;
  severity: Severity;
  details: string;
}

const MOCK_LOG: AuditEntry[] = [
  { id: "1",  timestamp: "2026-03-28 11:34:02", actor: "Sean Hogg",      actorEmail: "seanhogg@gmail.com", action: "IMPERSONATION_STARTED",   target: "alice@example.com", severity: "warning",  details: "SuperAdmin started impersonation session" },
  { id: "2",  timestamp: "2026-03-28 11:20:45", actor: "Sean Hogg",      actorEmail: "seanhogg@gmail.com", action: "IMPERSONATION_ENDED",     target: "alice@example.com", severity: "info",     details: "Impersonation session ended after 12m 30s" },
  { id: "3",  timestamp: "2026-03-28 10:55:01", actor: "David Lee",      actorEmail: "david@example.com",  action: "USER_ROLE_CHANGED",       target: "carol@example.com", severity: "warning",  details: "Role changed from Recruiter to JobSeeker" },
  { id: "4",  timestamp: "2026-03-28 10:10:33", actor: "Alice Johnson",  actorEmail: "alice@example.com",  action: "JOB_POSTED",              target: "Job #441",          severity: "info",     details: "New job listing published" },
  { id: "5",  timestamp: "2026-03-28 09:47:12", actor: "Carol White",    actorEmail: "carol@example.com",  action: "USER_SUSPENDED",          target: "carol@example.com", severity: "critical", details: "Account suspended due to policy violation" },
  { id: "6",  timestamp: "2026-03-27 22:01:55", actor: "System",         actorEmail: "system",             action: "SUBSCRIPTION_PAST_DUE",   target: "carol@example.com", severity: "warning",  details: "Payment failed — subscription marked past_due" },
  { id: "7",  timestamp: "2026-03-27 18:30:00", actor: "Eva Martinez",   actorEmail: "eva@example.com",    action: "USER_REGISTERED",         target: "eva@example.com",   severity: "info",     details: "New user registered with Affiliate persona" },
  { id: "8",  timestamp: "2026-03-27 14:22:08", actor: "Sean Hogg",      actorEmail: "seanhogg@gmail.com", action: "MODULE_TOGGLED",          target: "ads",               severity: "warning",  details: "Module 'Ad Slots' disabled" },
  { id: "9",  timestamp: "2026-03-27 12:00:00", actor: "System",         actorEmail: "system",             action: "SUBSCRIPTION_RENEWED",    target: "david@example.com", severity: "info",     details: "Annual subscription auto-renewed: $790" },
  { id: "10", timestamp: "2026-03-26 09:15:22", actor: "Bob Smith",      actorEmail: "bob@example.com",    action: "PASSWORD_RESET",          target: "bob@example.com",   severity: "info",     details: "Password reset via magic link" },
];

const SEVERITY_STYLES: Record<Severity, string> = {
  info:     "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  warning:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const ACTION_CATEGORIES = [
  "All Actions",
  "IMPERSONATION_STARTED",
  "IMPERSONATION_ENDED",
  "USER_ROLE_CHANGED",
  "USER_SUSPENDED",
  "USER_REGISTERED",
  "MODULE_TOGGLED",
  "SUBSCRIPTION_PAST_DUE",
  "SUBSCRIPTION_RENEWED",
  "JOB_POSTED",
  "PASSWORD_RESET",
];

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [severityFilter, setSeverityFilter] = useState("all");

  const filtered = MOCK_LOG.filter((e) => {
    const matchSearch =
      e.actor.toLowerCase().includes(search.toLowerCase()) ||
      e.actorEmail.toLowerCase().includes(search.toLowerCase()) ||
      e.target.toLowerCase().includes(search.toLowerCase()) ||
      e.details.toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === "All Actions" || e.action === actionFilter;
    const matchSeverity = severityFilter === "all" || e.severity === severityFilter;
    return matchSearch && matchAction && matchSeverity;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground text-sm">Complete history of platform events and admin actions.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actor, target, or details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[210px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_CATEGORIES.map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                  {entry.timestamp}
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">{entry.actor}</p>
                  <p className="text-xs text-muted-foreground">{entry.actorEmail}</p>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {entry.action}
                  </code>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{entry.target}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_STYLES[entry.severity]}`}>
                    {entry.severity}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={entry.details}>
                  {entry.details}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No log entries match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

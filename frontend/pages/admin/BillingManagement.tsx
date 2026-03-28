import React, { useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, Users, Search, MoreHorizontal } from "lucide-react";
import { useAdminPermissions } from "@/lib/admin-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

interface Subscription {
  id: string;
  user: string;
  email: string;
  plan: string;
  status: "active" | "trialing" | "canceled" | "past_due";
  amount: number;
  interval: "monthly" | "annual";
  nextBilling: string;
  started: string;
}

const MOCK_SUBS: Subscription[] = [
  { id: "sub_1", user: "Alice Johnson",  email: "alice@example.com", plan: "Employer Pro",   status: "active",   amount: 79,  interval: "monthly", nextBilling: "2026-04-28", started: "2025-01-15" },
  { id: "sub_2", user: "Bob Smith",      email: "bob@example.com",   plan: "Job Seeker Pro", status: "trialing", amount: 19,  interval: "monthly", nextBilling: "2026-04-07", started: "2026-03-28" },
  { id: "sub_3", user: "Carol White",    email: "carol@example.com", plan: "Recruiter Pro",  status: "past_due", amount: 49,  interval: "monthly", nextBilling: "2026-03-15", started: "2024-11-20" },
  { id: "sub_4", user: "David Lee",      email: "david@example.com", plan: "Employer Pro",   status: "active",   amount: 790, interval: "annual",  nextBilling: "2027-01-01", started: "2026-01-01" },
  { id: "sub_5", user: "Eva Martinez",   email: "eva@example.com",   plan: "Affiliate",      status: "active",   amount: 0,   interval: "monthly", nextBilling: "—",          started: "2026-03-25" },
  { id: "sub_6", user: "Frank Nguyen",   email: "frank@example.com", plan: "Recruiter Pro",  status: "canceled", amount: 49,  interval: "monthly", nextBilling: "—",          started: "2024-06-01" },
];

const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-100 text-green-800",
  trialing: "bg-blue-100 text-blue-800",
  canceled: "bg-gray-100 text-gray-600",
  past_due: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  active:   "Active",
  trialing: "Trial",
  canceled: "Canceled",
  past_due: "Past Due",
};

const mrr = MOCK_SUBS
  .filter((s) => s.status === "active" || s.status === "trialing")
  .reduce((sum, s) => sum + (s.interval === "annual" ? Math.round(s.amount / 12) : s.amount), 0);

const arr = mrr * 12;

const churnCount = MOCK_SUBS.filter((s) => s.status === "canceled").length;
const activeCount = MOCK_SUBS.filter((s) => s.status === "active").length;
const trialCount  = MOCK_SUBS.filter((s) => s.status === "trialing").length;
const pastDueCount = MOCK_SUBS.filter((s) => s.status === "past_due").length;

export default function BillingManagement() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { can } = useAdminPermissions();
  const canUpdate = can("billing", "update");
  const canDelete = can("billing", "delete");

  const filtered = MOCK_SUBS.filter((s) => {
    const matchSearch = s.user.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Subscriptions</h1>
        <p className="text-muted-foreground text-sm">Revenue overview and subscription management.</p>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">MRR</p>
                <p className="text-2xl font-bold">${mrr.toLocaleString()}</p>
              </div>
              <DollarSign className="h-5 w-5 text-green-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">ARR</p>
                <p className="text-2xl font-bold">${arr.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">{trialCount} trialing</p>
              </div>
              <Users className="h-5 w-5 text-purple-500 mt-1" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">At Risk</p>
                <p className="text-2xl font-bold text-red-600">{pastDueCount + churnCount}</p>
                <p className="text-xs text-muted-foreground">{pastDueCount} past due · {churnCount} canceled</p>
              </div>
              <TrendingDown className="h-5 w-5 text-red-500 mt-1" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by user or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Subscription table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Next Billing</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((sub) => (
              <TableRow key={sub.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{sub.user}</p>
                    <p className="text-xs text-muted-foreground">{sub.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm">{sub.plan}</p>
                    <p className="text-xs text-muted-foreground capitalize">{sub.interval}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status]}`}>
                    {STATUS_LABELS[sub.status]}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {sub.amount === 0 ? "Free" : `$${sub.amount}/${sub.interval === "annual" ? "yr" : "mo"}`}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{sub.nextBilling}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>View Details</DropdownMenuItem>
                      {canUpdate && <DropdownMenuItem>Change Plan</DropdownMenuItem>}
                      {canUpdate && <DropdownMenuItem>Issue Refund</DropdownMenuItem>}
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive">Cancel Subscription</DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

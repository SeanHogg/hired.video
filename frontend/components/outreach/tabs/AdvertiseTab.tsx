/**
 * AdvertiseTab — paid distribution surface. Owns:
 *   • KPI overview (spend/impressions/clicks/CPA)
 *   • Sponsored Job Listings table with boost pause/resume/cancel
 *   • Featured Company Profile early-access waitlist card
 *
 * Pure presentation; boost actions + dialog trigger come in as props.
 */
import { useState } from "react";
import {
  DollarSign,
  Eye,
  Megaphone,
  MousePointer,
  Network,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { confirmDialog } from "@/lib/dialogs";
import { Badge } from "@/components/ui/badge";
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
import type {
  AdvertisingStats,
  JobBoost,
} from "@/lib/services/advertising-service";

export interface AdvertiseTabProps {
  adStats: AdvertisingStats | null;
  activeBoosts: JobBoost[];
  featuredProfileInterest: boolean;
  onOpenBoostDialog: () => void;
  onRequestFeaturedProfile: () => void;
  onPauseBoost: (id: string) => Promise<void>;
  onResumeBoost: (id: string) => Promise<void>;
  onCancelBoost: (id: string) => Promise<void>;
}

export function AdvertiseTab({
  adStats,
  activeBoosts,
  featuredProfileInterest,
  onOpenBoostDialog,
  onRequestFeaturedProfile,
  onPauseBoost,
  onResumeBoost,
  onCancelBoost,
}: AdvertiseTabProps) {
  const [busyBoostId, setBusyBoostId] = useState<string | null>(null);

  const runBoostAction = async (
    id: string,
    action: (id: string) => Promise<void>,
  ) => {
    setBusyBoostId(id);
    try {
      await action(id);
    } finally {
      setBusyBoostId(null);
    }
  };

  const activeBoostCount = adStats?.activeBoosts ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <KpiCard
          title="Total Ad Spend"
          icon={DollarSign}
          value={`$${(adStats?.totalSpentDollars ?? 0).toFixed(2)}`}
          caption={`${activeBoostCount} active boost${activeBoostCount !== 1 ? "s" : ""}`}
        />
        <KpiCard
          title="Impressions"
          icon={Eye}
          value={(adStats?.totalImpressions ?? 0).toLocaleString()}
          caption="Total ad impressions"
        />
        <KpiCard
          title="Clicks"
          icon={MousePointer}
          value={(adStats?.totalClicks ?? 0).toLocaleString()}
          caption={`${(adStats?.ctr ?? 0).toFixed(2)}% CTR`}
        />
        <KpiCard
          title="Cost per Application"
          icon={TrendingUp}
          value={
            adStats?.costPerApplication != null
              ? `$${adStats.costPerApplication.toFixed(2)}`
              : "—"
          }
          caption={
            adStats?.totalApplications
              ? `${adStats.totalApplications} attributed`
              : "No applications attributed yet"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-brand-purple" />
                Sponsored Job Listings
              </CardTitle>
              <CardDescription>
                Boost jobs to the top of search results and the talent discovery feed
              </CardDescription>
            </div>
            <Button
              onClick={onOpenBoostDialog}
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
            >
              <Zap className="h-4 w-4 mr-2" />
              Boost a Job
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeBoosts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBoosts.map((boost) => (
                  <TableRow key={boost.id}>
                    <TableCell className="font-medium">
                      {boost.jobTitle ?? boost.jobId.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize text-xs">
                        {boost.placementType.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={boost.status === "active" ? "default" : "secondary"}
                        className={`text-xs ${boost.status === "active" ? "bg-green-500/10 text-green-600" : ""}`}
                      >
                        {boost.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ${boost.budgetDollars.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ${boost.spentDollars.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {boost.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {boost.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {boost.ctr.toFixed(2)}%
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        {boost.status === "active" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyBoostId === boost.id}
                            onClick={() => runBoostAction(boost.id, onPauseBoost)}
                          >
                            Pause
                          </Button>
                        )}
                        {boost.status === "paused" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyBoostId === boost.id}
                            onClick={() => runBoostAction(boost.id, onResumeBoost)}
                          >
                            Resume
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={busyBoostId === boost.id}
                          onClick={async () => {
                            if (!(await confirmDialog({ title: "Cancel boost", description: "Cancel this boost?", confirmText: "Cancel boost", destructive: true }))) return;
                            runBoostAction(boost.id, onCancelBoost);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No sponsored listings yet</p>
              <p className="text-sm mb-6">
                Boost a job to reach qualified candidates faster and cut time-to-hire.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto text-left mb-8">
                <PlacementCard
                  title="Search Top"
                  description="First result in keyword search — highest intent traffic"
                />
                <PlacementCard
                  title="Discovery Feed"
                  description="Featured card in the TikTok-style talent discovery feed"
                />
                <PlacementCard
                  title="Both Placements"
                  description="Maximum reach — search + feed simultaneously"
                />
              </div>
              <Button onClick={onOpenBoostDialog} variant="outline">
                <Zap className="h-4 w-4 mr-2" />
                Create Your First Boost
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-brand-blue" />
                Featured Company Profile
              </CardTitle>
              <CardDescription>
                Promote your employer brand in company search, candidate dashboards, and the talent discovery feed
              </CardDescription>
            </div>
            {featuredProfileInterest ? (
              <Badge
                variant="outline"
                className="gap-1 text-green-700 border-green-200 bg-green-50"
              >
                <Star className="h-3 w-3" />
                You're on the list
              </Badge>
            ) : (
              <Button variant="outline" onClick={onRequestFeaturedProfile}>
                Request Early Access
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SurfaceCard
              icon={Network}
              title="Company Directory"
              description="Featured slot in employer search results"
            />
            <SurfaceCard
              icon={Users}
              title="Candidate Dashboard"
              description="Spotlight card shown to active job seekers"
            />
            <SurfaceCard
              icon={TrendingUp}
              title="Discovery Feed"
              description="Branded employer card in the talent feed"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PlacementCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-4">
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function SurfaceCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 text-center">
      <Icon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
      <div className="font-medium text-sm mb-1">{title}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

export default AdvertiseTab;

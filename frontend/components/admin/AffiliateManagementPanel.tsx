import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Users,
  UserCheck,
  UserX,
  Ban,
  CheckCircle
} from "lucide-react";
import { AffiliateService, type PaginatedAffiliates, type AffiliateManagement, type AffiliateDetail } from "@/lib/services/affiliate-service";
import { useToast } from "@/components/ui/use-toast";

interface AffiliateManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AffiliateManagementPanel({ open, onOpenChange }: AffiliateManagementPanelProps) {
  const [affiliates, setAffiliates] = useState<PaginatedAffiliates | null>(null);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AffiliateDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("list");
  const { toast } = useToast();

  // Memoize the service instance to prevent infinite loop
  const affiliateService = useMemo(() => new AffiliateService(), []);

  const loadAffiliates = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {
        pageNumber: currentPage,
        pageSize: 20,
      };

      if (searchTerm) params.searchTerm = searchTerm;
      if (statusFilter === "active") params.isActive = true;
      if (statusFilter === "inactive") params.isActive = false;
      if (statusFilter === "suspended") params.isSuspended = true;

      const data = await affiliateService.getAllAffiliates(params);
      setAffiliates(data);
    } catch (_error) {
      // console.error("Failed to load affiliates:", _error);
      toast({
        title: "Error",
        description: "Failed to load affiliates",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [affiliateService, currentPage, searchTerm, statusFilter, toast]);

  useEffect(() => {
    if (open) {
      loadAffiliates();
    }
  }, [open, loadAffiliates]);

  const loadAffiliateDetail = async (userId: string) => {
    try {
      setLoading(true);
      const detail = await affiliateService.getAffiliateDetail(userId);
      setSelectedAffiliate(detail);
      setActiveTab("detail");
    } catch (error) {
      // console.error("Failed to load affiliate detail:", error);
      toast({
        title: "Error",
        description: "Failed to load affiliate details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, action: "activate" | "deactivate" | "suspend" | "unsuspend", reason?: string) => {
    try {
      setLoading(true);
      
      switch (action) {
        case "activate":
          await affiliateService.activateAffiliate(userId, reason);
          break;
        case "deactivate":
          await affiliateService.deactivateAffiliate(userId, reason);
          break;
        case "suspend":
          await affiliateService.suspendAffiliate(userId, reason || "Administrative action");
          break;
        case "unsuspend":
          await affiliateService.unsuspendAffiliate(userId, reason);
          break;
      }

      toast({
        title: "Success",
        description: `Affiliate ${action}d successfully`,
      });

      // Reload data
      await loadAffiliates();
      if (selectedAffiliate?.userId === userId) {
        await loadAffiliateDetail(userId);
      }
    } catch (error) {
      // console.error(`Failed to ${action} affiliate:`, error);
      toast({
        title: "Error",
        description: `Failed to ${action} affiliate`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (affiliate: AffiliateManagement) => {
    if (affiliate.isSuspended) {
      return <Badge variant="destructive">Suspended</Badge>;
    }
    if (affiliate.isActive) {
      return <Badge variant="default">Active</Badge>;
    }
    return <Badge variant="secondary">Inactive</Badge>;
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[90%] sm:w-[800px] sm:max-w-[800px]">
        <SheetHeader>
          <SheetTitle>Affiliate Management</SheetTitle>
          <SheetDescription>
            Manage affiliate accounts, view performance, and handle status changes
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Affiliate List</TabsTrigger>
            <TabsTrigger value="detail" disabled={!selectedAffiliate}>
              Affiliate Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {/* Search and Filters */}
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or referral code..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Affiliates List */}
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">Loading affiliates...</div>
              ) : affiliates?.affiliates.length ? (
                affiliates.affiliates.map((affiliate) => (
                  <Card key={affiliate.userId} className="cursor-pointer hover:bg-muted/50" onClick={() => loadAffiliateDetail(affiliate.userId)}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {affiliate.firstName && affiliate.lastName 
                                ? `${affiliate.firstName} ${affiliate.lastName}`
                                : affiliate.email
                              }
                            </p>
                            <p className="text-sm text-muted-foreground">{affiliate.email}</p>
                            <p className="text-xs text-muted-foreground">Code: {affiliate.referralCode}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-1">
                          {getStatusBadge(affiliate)}
                          <p className="text-sm font-medium">{formatCurrency(affiliate.totalCommissionCents)}</p>
                          <p className="text-xs text-muted-foreground">
                            {affiliate.totalReferrals} referrals • {affiliate.totalConversions} conversions
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No affiliates found
                </div>
              )}
            </div>

            {/* Pagination */}
            {affiliates && affiliates.totalPages > 1 && (
              <div className="flex justify-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="flex items-center px-3 text-sm">
                  Page {currentPage} of {affiliates.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(affiliates.totalPages, currentPage + 1))}
                  disabled={currentPage === affiliates.totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="detail" className="space-y-4">
            {selectedAffiliate && (
              <div className="space-y-6">
                {/* Affiliate Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>
                          {selectedAffiliate.firstName && selectedAffiliate.lastName 
                            ? `${selectedAffiliate.firstName} ${selectedAffiliate.lastName}`
                            : selectedAffiliate.email
                          }
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">{selectedAffiliate.email}</p>
                        <p className="text-sm text-muted-foreground">Code: {selectedAffiliate.referralCode}</p>
                      </div>
                      <div className="space-y-2">
                        {getStatusBadge(selectedAffiliate)}
                        <div className="flex space-x-2">
                          {selectedAffiliate.isActive ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(selectedAffiliate.userId, "deactivate")}
                            >
                              <UserX className="h-4 w-4 mr-1" />
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(selectedAffiliate.userId, "activate")}
                            >
                              <UserCheck className="h-4 w-4 mr-1" />
                              Activate
                            </Button>
                          )}
                          {selectedAffiliate.isSuspended ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleStatusChange(selectedAffiliate.userId, "unsuspend")}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Unsuspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleStatusChange(selectedAffiliate.userId, "suspend", "Administrative suspension")}
                            >
                              <Ban className="h-4 w-4 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm font-medium">Total Referrals</p>
                        <p className="text-2xl font-bold">{selectedAffiliate.totalReferrals}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Conversions</p>
                        <p className="text-2xl font-bold">{selectedAffiliate.totalConversions}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Total Earned</p>
                        <p className="text-2xl font-bold">{formatCurrency(selectedAffiliate.totalCommissionCents)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Pending</p>
                        <p className="text-2xl font-bold">{formatCurrency(selectedAffiliate.pendingCommissionCents)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Referrals</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {selectedAffiliate.recentReferrals?.length ? (
                          selectedAffiliate.recentReferrals.map((referral, index) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">{referral.referredUserEmail}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(referral.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              {referral.hasConverted && (
                                <Badge variant="default" className="text-xs">Converted</Badge>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No recent referrals</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Recent Conversions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {selectedAffiliate.recentConversions?.length ? (
                          selectedAffiliate.recentConversions.map((conversion, index) => (
                            <div key={index} className="flex items-center justify-between p-2 border rounded">
                              <div>
                                <p className="text-sm font-medium">{conversion.referredUserEmail}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(conversion.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium">{formatCurrency(conversion.commissionAmountCents)}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(conversion.subscriptionAmountCents)} sub
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No recent conversions</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

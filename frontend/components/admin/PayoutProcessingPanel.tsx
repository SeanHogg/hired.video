import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  RefreshCw,
  Eye
} from "lucide-react";
import { AffiliateService, type AffiliatePayoutSummary } from "@/lib/services/affiliate-service";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface PayoutProcessingPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayoutProcessingPanel({ open, onOpenChange }: PayoutProcessingPanelProps) {
  const [pendingPayouts, setPendingPayouts] = useState<AffiliatePayoutSummary[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<AffiliatePayoutSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [rejectReason, setRejectReason] = useState("");
  const [approvalNotes, setApprovalNotes] = useState("");
  const { toast } = useToast();

  // Memoize the service instance to prevent infinite loop
  const affiliateService = useMemo(() => new AffiliateService(), []);

  const loadPendingPayouts = useCallback(async () => {
    try {
      setLoading(true);
      const payouts = await affiliateService.getPendingPayouts();
      setPendingPayouts(payouts);
    } catch (error) {
      // console.error("Failed to load pending payouts:", error);
      toast({
        title: "Error",
        description: "Failed to load pending payouts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [affiliateService, toast]);

  useEffect(() => {
    if (open) {
      loadPendingPayouts();
    }
  }, [open, loadPendingPayouts]);

  const handleApprovePayout = async (payoutId: string, notes?: string) => {
    try {
      setActionLoading(payoutId);
      await affiliateService.approvePayout(payoutId, notes);

      toast({
        title: "Success",
        description: "Payout approved successfully",
      });

      // Reload payouts
      await loadPendingPayouts();
      setApprovalNotes("");
    } catch (error) {
      // console.error("Failed to approve payout:", error);
      toast({
        title: "Error",
        description: "Failed to approve payout",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPayout = async (payoutId: string, reason: string) => {
    try {
      setActionLoading(payoutId);
      await affiliateService.rejectPayout(payoutId, reason);

      toast({
        title: "Success",
        description: "Payout rejected successfully",
      });

      // Reload payouts
      await loadPendingPayouts();
      setRejectReason("");
    } catch (error) {
      // console.error("Failed to reject payout:", error);
      toast({
        title: "Error",
        description: "Failed to reject payout",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleProcessPayout = async (payoutId: string) => {
    try {
      setActionLoading(payoutId);
      await affiliateService.processPayout(payoutId);

      toast({
        title: "Success",
        description: "Payout processing initiated",
      });

      // Reload payouts
      await loadPendingPayouts();
    } catch (error) {
      // console.error("Failed to process payout:", error);
      toast({
        title: "Error",
        description: "Failed to process payout",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "requested":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Requested</Badge>;
      case "approved":
        return <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Approved</Badge>;
      case "processing":
        return <Badge variant="outline"><RefreshCw className="h-3 w-3 mr-1" />Processing</Badge>;
      case "paid":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:max-w-[800px]">
        <SheetHeader>
          <SheetTitle>Payout Processing</SheetTitle>
          <SheetDescription>
            Review and process affiliate payout requests
          </SheetDescription>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">
              Pending Payouts ({pendingPayouts.length})
            </TabsTrigger>
            <TabsTrigger value="detail" disabled={!selectedPayout}>
              Payout Details
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Pending Payout Requests</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={loadPendingPayouts}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="text-center py-8">Loading pending payouts...</div>
              ) : pendingPayouts.length ? (
                pendingPayouts.map((payout) => (
                  <Card key={payout.payoutId} className="cursor-pointer hover:bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <DollarSign className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium">{payout.affiliateUserName}</p>
                            <p className="text-sm text-muted-foreground">{payout.affiliateEmail}</p>
                            <p className="text-xs text-muted-foreground">
                              Requested: {formatDate(payout.requestedAt)}
                            </p>
                          </div>
                        </div>
                        <div className="text-right space-y-2">
                          <p className="text-xl font-bold">{formatCurrency(payout.amountCents)}</p>
                          {getStatusBadge(payout.status)}
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPayout(payout);
                                setActiveTab("detail");
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            {payout.status.toLowerCase() === "requested" && (
                              <>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="default">
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Approve
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Approve Payout</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Approve payout of {formatCurrency(payout.amountCents)} for {payout.affiliateUserName}?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <div className="space-y-2">
                                      <Label htmlFor="approval-notes">Notes (optional)</Label>
                                      <Textarea
                                        id="approval-notes"
                                        placeholder="Add any notes about this approval..."
                                        value={approvalNotes}
                                        onChange={(e) => setApprovalNotes(e.target.value)}
                                      />
                                    </div>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleApprovePayout(payout.payoutId, approvalNotes)}
                                        disabled={actionLoading === payout.payoutId}
                                      >
                                        {actionLoading === payout.payoutId ? "Approving..." : "Approve"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="destructive">
                                      <XCircle className="h-4 w-4 mr-1" />
                                      Reject
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reject Payout</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Reject payout of {formatCurrency(payout.amountCents)} for {payout.affiliateUserName}?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <div className="space-y-2">
                                      <Label htmlFor="reject-reason">Reason for rejection *</Label>
                                      <Textarea
                                        id="reject-reason"
                                        placeholder="Please provide a reason for rejecting this payout..."
                                        value={rejectReason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                        required
                                      />
                                    </div>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleRejectPayout(payout.payoutId, rejectReason)}
                                        disabled={!rejectReason.trim() || actionLoading === payout.payoutId}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {actionLoading === payout.payoutId ? "Rejecting..." : "Reject"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                            {payout.status.toLowerCase() === "approved" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="default">
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Process
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Process Payout</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will initiate the payout of {formatCurrency(payout.amountCents)} to {payout.affiliateUserName}.
                                      The payout will be processed immediately.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleProcessPayout(payout.payoutId)}
                                      disabled={actionLoading === payout.payoutId}
                                    >
                                      {actionLoading === payout.payoutId ? "Processing..." : "Process Payout"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending payouts</p>
                  <p className="text-sm">All payouts have been processed</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="detail" className="space-y-4">
            {selectedPayout && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Payout Details</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Payout ID: {selectedPayout.payoutId}
                        </p>
                      </div>
                      {getStatusBadge(selectedPayout.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Affiliate</Label>
                        <p className="text-lg">{selectedPayout.affiliateUserName}</p>
                        <p className="text-sm text-muted-foreground">{selectedPayout.affiliateEmail}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Amount</Label>
                        <p className="text-2xl font-bold">{formatCurrency(selectedPayout.amountCents)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Requested</Label>
                        <p className="text-lg">{formatDate(selectedPayout.requestedAt)}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Status</Label>
                        <div className="mt-1">{getStatusBadge(selectedPayout.status)}</div>
                      </div>
                    </div>

                    {selectedPayout.paidAt && (
                      <div>
                        <Label className="text-sm font-medium">Paid At</Label>
                        <p className="text-lg">{formatDate(selectedPayout.paidAt)}</p>
                      </div>
                    )}

                    {selectedPayout.providerReferenceId && (
                      <div>
                        <Label className="text-sm font-medium">Provider Reference</Label>
                        <p className="text-sm font-mono bg-muted p-2 rounded">
                          {selectedPayout.providerReferenceId}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

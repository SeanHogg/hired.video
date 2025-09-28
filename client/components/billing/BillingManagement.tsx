import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { CreditCard, FileText, AlertCircle, Pencil, Trash2, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { billingService, type PaymentMethod, type Invoice, type AIUsageMonth, type SubscriptionSummary } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";






export function BillingManagement() {
  const [activeTab, setActiveTab] = useState("overview");

  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsageMonth | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment method panel state
  const [pmPanelOpen, setPmPanelOpen] = useState(false);
  const [pmPanelMode, setPmPanelMode] = useState<"add" | "edit">("add");
  const [editingPmId, setEditingPmId] = useState<string | null>(null);
  const [pmSubmitting, setPmSubmitting] = useState(false);
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);
  const clientSecretRef = useRef<string | null>(null);
  const publishableKeyRef = useRef<string | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeletePmId, setPendingDeletePmId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        if (activeTab === "overview") {
          const [usage, sub] = await Promise.all([
            billingService.getMonthlyAIUsage(),
            billingService.getSubscription(),
          ]);
          if (isMounted) {
            setAiUsage(usage);
            setSubscription(sub);
          }

  // (Stripe helpers and PM handlers declared below, outside useEffect)

        } else if (activeTab === "payment-methods") {
          const [pms, sub] = await Promise.all([
            billingService.getPaymentMethods(),
            billingService.getSubscription(),
          ]);
          if (isMounted) {
            setPaymentMethods(pms);
            setSubscription(sub);
          }
        } else if (activeTab === "invoices") {
          const invs = await billingService.getInvoices();
          if (isMounted) setInvoices(invs);
        }
      } catch (error) {
        console.error("Failed to load billing data:", error);
        if (isMounted) setError("Failed to load billing data. Please try again.");
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [activeTab]);

  // Helpers to load Stripe.js and initialize Elements
  async function ensureStripeLoaded(): Promise<void> {
    if ((window as any).Stripe && stripeRef.current) return;
    if (!(window as any).Stripe) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://js.stripe.com/v3";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Stripe.js"));
        document.body.appendChild(script);
      });
    }
    const pk = publishableKeyRef.current ?? (await billingService.getStripePublicKey());
    publishableKeyRef.current = pk;
    stripeRef.current = (window as any).Stripe(pk);
  }

  async function initCardElement(): Promise<void> {
    await ensureStripeLoaded();
    // Create SetupIntent client secret
    const clientSecret = await billingService.createSetupIntent();
    clientSecretRef.current = clientSecret;
    const elements = stripeRef.current.elements();
    elementsRef.current = elements;
    // Clean up existing
    if (cardElementRef.current) {
      try { cardElementRef.current.unmount(); } catch {}
    }
    const card = elements.create("card", { hidePostalCode: true });
    cardElementRef.current = card;
    if (cardContainerRef.current) {
      card.mount(cardContainerRef.current);
    }
  }

  async function handleOpenAdd() {
    setPmPanelMode("add");
    setEditingPmId(null);
    setPmPanelOpen(true);
    setTimeout(() => { initCardElement().catch(console.error); }, 0);
  }

  async function handleOpenEdit(pmId: string) {
    setPmPanelMode("edit");
    setEditingPmId(pmId);
    setPmPanelOpen(true);
    setTimeout(() => { initCardElement().catch(console.error); }, 0);
  }

  async function handleSavePaymentMethod() {
    if (!clientSecretRef.current || !elementsRef.current || !cardElementRef.current) return;
    try {
      setPmSubmitting(true);
      const result = await stripeRef.current.confirmCardSetup(clientSecretRef.current, {
        payment_method: { card: cardElementRef.current },
      });
      if (result.error) {
        throw new Error(result.error.message || "Payment method error");
      }
      const paymentMethodId = result.setupIntent?.payment_method as string;
      if (!paymentMethodId) throw new Error("No payment method id returned");
      await billingService.savePaymentMethod(paymentMethodId);
      // If editing, optionally detach previous
      if (pmPanelMode === "edit" && editingPmId) {
        try { await billingService.deletePaymentMethod(editingPmId); } catch {}
      }
      // Refresh list
      const pms = await billingService.getPaymentMethods();
      setPaymentMethods(pms);
      setPmPanelOpen(false);
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setPmSubmitting(false);
    }
  }

  function openDelete(pmId: string) {
    setPendingDeletePmId(pmId);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!pendingDeletePmId) return;
    try {
      await billingService.deletePaymentMethod(pendingDeletePmId);
      const pms = await billingService.getPaymentMethods();
      setPaymentMethods(pms);
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setDeleteDialogOpen(false);
      setPendingDeletePmId(null);
    }
  }



  if (isLoading) {
    return (
      <div className="text-center py-8">Loading billing information...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-8 w-8" />
            Billing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your subscription, payment methods, and billing history
          </p>
        </div>
      </div>

      {error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>

          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {subscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Current Plan
                  <Badge variant={subscription.isPremium ? "default" : "secondary"}>
                    {subscription.isPremium ? "Premium" : "Free"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{subscription.planName}</h3>
                    {subscription.currentPeriodEnd && (
                      <p className="text-muted-foreground">
                        {subscription.isPremium ? "Next billing:" : "Plan valid until:"} {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {subscription.isPremium ? `${subscription.currency} ${subscription.price.toFixed(2)}` : "$0.00"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {subscription.isPremium ? `per ${subscription.interval}` : "Free"}
                    </div>
                  </div>
                </div>

                {subscription.cancelAtPeriodEnd && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your subscription will be canceled at the end of the current billing period.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  {!subscription.isPremium ? (
                    <Button asChild>
                      <a href="/pricing">Upgrade</a>
                    </Button>
                  ) : (
                    <Button variant="outline" asChild>
                      <a href="/pricing">Manage subscription</a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {aiUsage && (
            <Card>
              <CardHeader>
                <CardTitle>AI Usage This Month</CardTitle>

              </CardHeader>
              <CardContent className="space-y-2">
                {aiUsage.isUnlimited ? (
                  <div className="text-sm text-muted-foreground">Unlimited AI usage</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">AI Credits</span>
                      <span className="text-sm text-muted-foreground">
                        {aiUsage.used} used • {aiUsage.remaining} of {aiUsage.limit ?? FREE_AI_MONTHLY_LIMIT} remaining
                      </span>
                    </div>
                    <Progress
                      value={Math.min(
                        100,
                        (aiUsage.used / (aiUsage.limit ?? FREE_AI_MONTHLY_LIMIT)) * 100,
                      )}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>


        <TabsContent value="payment-methods" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Payment methods</h3>
            <Button size="sm" onClick={handleOpenAdd}>
              <Plus className="h-4 w-4 mr-1" /> Add payment method
            </Button>
          </div>
          {paymentMethods.length === 0 ? (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                No payment methods on file. Add one to avoid service interruption.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {paymentMethods.map((pm) => (
                <Card key={pm.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium uppercase">
                          {pm.brand} •••• {pm.last4}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Expires {pm.expiryMonth}/{pm.expiryYear}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                      <Button variant="outline" size="sm" onClick={() => handleOpenEdit(pm.id)}>
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => openDelete(pm.id)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Side panel for add/edit payment method */}
          <Sheet open={pmPanelOpen} onOpenChange={setPmPanelOpen}>
            <SheetContent side="right" className="sm:max-w-md">
              <SheetHeader>
                <SheetTitle>{pmPanelMode === "add" ? "Add payment method" : "Update payment method"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                <div ref={cardContainerRef} id="card-element" className="p-3 border rounded-md" />
                <div id="card-errors" className="text-sm text-red-500" />
                <Button onClick={handleSavePaymentMethod} disabled={pmSubmitting} className="w-full">
                  {pmSubmitting ? "Saving..." : pmPanelMode === "add" ? "Save payment method" : "Save changes"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Delete confirmation modal */}
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete payment method?</DialogTitle>
                <DialogDescription>
                  {paymentMethods.length <= 1 && subscription?.isPremium
                    ? "This is your only payment method and you have an active subscription. Please add another payment method first or cancel your subscription."
                    : "This action cannot be undone. You can add another payment method at any time."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                {paymentMethods.length <= 1 && subscription?.isPremium ? (
                  <div className="flex w-full justify-between">
                    <Button variant="secondary" onClick={() => { setDeleteDialogOpen(false); handleOpenAdd(); }}>Add another method</Button>
                    <Button variant="outline" asChild>
                      <a href="/pricing">Manage subscription</a>
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          {invoices.length === 0 ? (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>No invoices found.</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {invoices.map((inv) => (
                <Card key={inv.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="font-medium">{inv.number}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(inv.invoiceDate).toLocaleDateString()} • {inv.currency}{" "}
                        {inv.amount.toFixed(2)}
                      </div>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <a href={inv.downloadUrl}>Download</a>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

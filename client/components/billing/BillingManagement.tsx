import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { CreditCard, FileText, Settings, AlertCircle } from "lucide-react";

import { billingService, type SubscriptionSummary, type PaymentMethod, type Invoice, type AIUsageMonth } from "@/lib/services/billing-service";
import { PREMIUM_MONTHLY_PRICE, FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";






export function BillingManagement() {
  const [activeTab, setActiveTab] = useState("overview");
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [aiUsage, setAiUsage] = useState<AIUsageMonth | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sub, usage, pms, invs] = await Promise.all([
        billingService.getSubscription(),
        billingService.getMonthlyAIUsage(),
        billingService.getPaymentMethods(),
        billingService.getInvoices(),
      ]);
      setSubscription(sub);
      setAiUsage(usage);
      setPaymentMethods(pms);
      setInvoices(invs);
    } catch (error) {
      console.error("Failed to load billing data:", error);
      setError("Failed to load billing data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };



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
            Billing & Subscriptions
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
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Current Plan */}
          {subscription && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Current Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {subscription.isPremium
                        ? `Premium ($${PREMIUM_MONTHLY_PRICE.toFixed(2)})`
                        : "Free"}
                    </h3>
                    {subscription.currentPeriodEnd && (
                      <p className="text-muted-foreground">
                        Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {subscription.isPremium ? `$${PREMIUM_MONTHLY_PRICE}` : "$0"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {subscription.isPremium ? "per month" : "Free"}
                    </div>
                  </div>
                </div>

                {subscription.cancelAtPeriodEnd && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Your subscription will be canceled at the end of the
                      current billing period.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* AI Usage Overview */}
          {aiUsage && (
            <Card>
              <CardHeader>
                <CardTitle>AI Usage This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {subscription?.isPremium ? (
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

        <TabsContent value="subscription" className="space-y-4">
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Detailed subscription management will be implemented in the next
              phase.
            </AlertDescription>
          </Alert>
        </TabsContent>

        <TabsContent value="payment-methods" className="space-y-4">
          {paymentMethods.length === 0 ? (
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>No payment methods on file.</AlertDescription>
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
                    {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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

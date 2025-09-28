import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { CreditCard, FileText, AlertCircle } from "lucide-react";

import { billingService, type PaymentMethod, type Invoice, type AIUsageMonth } from "@/lib/services/billing-service";
import { FREE_AI_MONTHLY_LIMIT } from "@shared/pricing";






export function BillingManagement() {
  const [activeTab, setActiveTab] = useState("overview");

  const [aiUsage, setAiUsage] = useState<AIUsageMonth | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        if (activeTab === "overview") {
          const usage = await billingService.getMonthlyAIUsage();
          if (isMounted) setAiUsage(usage);
        } else if (activeTab === "payment-methods") {
          const pms = await billingService.getPaymentMethods();
          if (isMounted) setPaymentMethods(pms);
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

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { CreditCard, Building2, Plus, AlertCircle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { billingService, type PaymentMethod } from "@/lib/services/billing-service";

interface PaymentMethodSetupProps {
  paymentMethods: PaymentMethod[];
  onPaymentMethodsChange: () => void;
  showTitle?: boolean;
  context?: "billing" | "affiliate" | "subscription";
  className?: string;
}

export function PaymentMethodSetup({ 
  paymentMethods, 
  onPaymentMethodsChange, 
  showTitle = true,
  context = "billing",
  className = ""
}: PaymentMethodSetupProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeletePmId, setPendingDeletePmId] = useState<string | null>(null);

  // Get context-specific messaging
  const getContextInfo = () => {
    switch (context) {
      case "affiliate":
        return {
          title: "Payout Methods",
          description: "Add payment methods to receive affiliate commission payouts",
          addButtonText: "Add payout method",
          emptyMessage: "No payout methods on file. Add a bank account to receive affiliate commissions.",
          recommendedType: "us_bank_account"
        };
      case "subscription":
        return {
          title: "Payment Methods",
          description: "Add payment methods for subscription billing",
          addButtonText: "Add payment method",
          emptyMessage: "No payment methods on file. Add one to avoid service interruption.",
          recommendedType: "card"
        };
      default:
        return {
          title: "Payment Methods",
          description: "Manage your payment methods for subscriptions and payouts",
          addButtonText: "Add payment method",
          emptyMessage: "No payment methods on file. Add one to get started.",
          recommendedType: "card"
        };
    }
  };

  const contextInfo = getContextInfo();

  async function handleAddPaymentMethod() {
    try {
      setIsSubmitting(true);
      setError(null);
      
      const successUrl = `${window.location.origin}${window.location.pathname}?pm_success=true`;
      const cancelUrl = `${window.location.origin}${window.location.pathname}`;
      
      const setupUrl = await billingService.createSetupSession(successUrl, cancelUrl);
      window.location.href = setupUrl;
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    } finally {
      setIsSubmitting(false);
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
      setDeleteDialogOpen(false);
      setPendingDeletePmId(null);
      onPaymentMethodsChange();
    } catch (e) {
      console.error(e);
      setError((e as Error).message);
    }
  }

  function getPaymentMethodIcon(type: string) {
    switch (type) {
      case "us_bank_account":
        return <Building2 className="h-5 w-5 text-primary" />;
      case "card":
      default:
        return <CreditCard className="h-5 w-5 text-primary" />;
    }
  }

  function getPaymentMethodDisplay(pm: PaymentMethod) {
    if (pm.type === "us_bank_account") {
      return {
        title: `${pm.brand || "Bank Account"} •••• ${pm.last4}`,
        subtitle: "Bank Account"
      };
    } else {
      return {
        title: `${pm.brand?.toUpperCase() || "CARD"} •••• ${pm.last4}`,
        subtitle: pm.expiryMonth && pm.expiryYear ? `Expires ${pm.expiryMonth}/${pm.expiryYear}` : "Credit/Debit Card"
      };
    }
  }

  // Filter payment methods based on context
  const filteredPaymentMethods = context === "affiliate" 
    ? paymentMethods.filter(pm => pm.type === "us_bank_account")
    : paymentMethods;

  return (
    <div className={`space-y-4 ${className}`}>
      {showTitle && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{contextInfo.title}</h3>
            <p className="text-sm text-muted-foreground">{contextInfo.description}</p>
          </div>
          <Button size="sm" onClick={handleAddPaymentMethod} disabled={isSubmitting}>
            <Plus className="h-4 w-4 mr-1" /> 
            {isSubmitting ? "Redirecting..." : contextInfo.addButtonText}
          </Button>
        </div>
      )}

      {error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {filteredPaymentMethods.length === 0 ? (
        <Alert>
          <CreditCard className="h-4 w-4" />
          <AlertDescription>
            {contextInfo.emptyMessage}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {filteredPaymentMethods.map((pm) => {
            const display = getPaymentMethodDisplay(pm);
            return (
              <Card key={pm.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    {getPaymentMethodIcon(pm.type)}
                    <div>
                      <div className="font-medium">
                        {display.title}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {display.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pm.isDefault && <Badge variant="secondary">Default</Badge>}
                    <Button variant="destructive" size="sm" onClick={() => openDelete(pm.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete payment method?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. You can add another payment method at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import {
  Lock,
  Shield,
  CheckCircle2,
  ArrowLeft,
  Users,
  Calendar,
  DollarSign,
  CreditCard,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BillingAddressForm } from "@/components/billing/BillingAddressForm";
import { AppShell } from "@/components/AppShell";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { profileService } from "@/lib/services/profile-service";
import { unlockTemplate, recordPurchaseOnServer } from "@/lib/template-unlocks";
import { TIER_COPY, TIER_NAME } from "@shared/tier-copy";
import {
  BillingAddressSchema,
  EMPTY_BILLING_ADDRESS,
  type BillingAddress,
} from "@shared/billing-address";
import { toast } from "sonner";

type TemplateKind = "resume" | "job" | "studio";

function parseTemplateCartId(id: string): { kind: TemplateKind; templateId: string } {
  if (!id.startsWith("template:")) return { kind: "resume", templateId: id };
  const rest = id.slice("template:".length);
  const sepIdx = rest.indexOf(":");
  if (sepIdx === -1) return { kind: "resume", templateId: rest };
  const head = rest.slice(0, sepIdx);
  const tail = rest.slice(sepIdx + 1);
  if (head === "resume" || head === "job" || head === "studio") {
    return { kind: head, templateId: tail };
  }
  return { kind: "resume", templateId: rest };
}

export default function Checkout() {  const { user, isAuthenticated } = useAuth();
  const { items, getTotalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { startPayment } = usePaymentFlow();

  const [isProcessing, setIsProcessing] = useState(false);
  const [address, setAddress] = useState<BillingAddress>({
    ...EMPTY_BILLING_ADDRESS,
    fullName: user?.name ?? "",
  });
  const [addressErrors, setAddressErrors] = useState<Partial<Record<keyof BillingAddress, string>>>({});
  const [addressLoading, setAddressLoading] = useState(true);
  const [paymentMethodType, setPaymentMethodType] = useState<"card" | "us_bank_account">("card");

  // Load saved address — pre-fills the form so returning customers don't
  // re-type their details every checkout.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setAddressLoading(true);
    profileService
      .getBillingAddress()
      .then((saved) => {
        if (cancelled) return;
        if (saved) setAddress(saved);
      })
      .catch(() => {
        // Silent — empty form is the right fallback.
      })
      .finally(() => {
        if (!cancelled) setAddressLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Redirect if not authenticated.
  useEffect(() => {
    if (!isAuthenticated) navigate("/login?redirect=/checkout");
  }, [isAuthenticated, navigate]);

  // Redirect if cart is empty.
  useEffect(() => {
    if (isAuthenticated && items.length === 0) navigate("/pricing");
  }, [items.length, isAuthenticated, navigate]);

  // Handle cancellation from payment provider redirect.
  useEffect(() => {
    const cancelled = searchParams.get("cancelled");
    if (cancelled === "true") {
      toast.error("Payment setup was cancelled. You can try again or choose a different payment method.");
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("cancelled");
      const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams]);

  const fulfillTemplates = () => {
    for (const item of items) {
      if (item.type !== "template") continue;
      const { kind, templateId } = parseTemplateCartId(item.id);
      unlockTemplate(templateId, kind);
      void recordPurchaseOnServer({
        kind,
        templateId,
        pricePaidCents: Math.round(item.price * 100),
        paymentRef: null,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      // $0 cart — skip payment entirely. Address still optional in this branch.
      if (getTotalPrice() === 0) {
        fulfillTemplates();
        clearCart();
        toast.success("Templates unlocked — they're yours to use.");
        navigate("/resumes");
        return;
      }

      // Validate the address up front so the user fixes typos before the
      // payment modal opens. Field-level errors render inline next to each
      // input via the form component.
      const parsed = BillingAddressSchema.safeParse(address);
      if (!parsed.success) {
        const fieldErrors: Partial<Record<keyof BillingAddress, string>> = {};
        for (const issue of parsed.error.issues) {
          const key = issue.path[0] as keyof BillingAddress | undefined;
          if (key) fieldErrors[key] = issue.message;
        }
        setAddressErrors(fieldErrors);
        setIsProcessing(false);
        toast.error("Please complete the billing address.");
        return;
      }
      setAddressErrors({});

      // Persist the address before opening the payment modal so the user
      // doesn't lose it if the modal is cancelled. Settings → Billing reads
      // from the same column, so the changes show up there immediately.
      try {
        await profileService.saveBillingAddress(parsed.data);
      } catch {
        // Save errors are non-blocking — the user can still pay.
      }

      await startPayment({
        amount: finalTotal,
        currency: "USD",
        paymentMethodType,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/checkout?cancelled=true`,
        onSuccess: () => {
          fulfillTemplates();
          clearCart();
          toast.success(`Payment successful! ${TIER_COPY.welcomeAfterCheckout()} 🎉`);
          navigate("/dashboard");
        },
        onError: (msg) => {
          toast.error(msg || "Payment failed. Please try again.");
          setIsProcessing(false);
        },
      });
    } catch (error) {
      console.error("Payment processing error:", error);
      toast.error("Payment failed. Please try again.");
      setIsProcessing(false);
    }
  };

  const totalPrice = getTotalPrice();
  const tax = totalPrice * 0.08; // 8% tax
  const finalTotal = totalPrice + tax;

  if (!isAuthenticated) return null;
  if (items.length === 0) return null;

  return (
    <AppShell bgClassName="bg-background">
<div className="pt-16 min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
          <div className="max-w-6xl mx-auto p-6">
            <div className="mb-8">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Pricing
              </Link>
              <h1 className="text-3xl font-bold">Checkout</h1>
              <p className="text-muted-foreground">
                Complete your {TIER_NAME.pro} upgrade
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
              {/* Order Summary */}
              <div className="lg:order-2">
                <Card className="sticky top-24">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Order Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {items.map((item) => (
                      <div key={item.id} className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium">{item.name}</h4>
                            {item.type === "template" ? (
                              <div className="text-sm text-muted-foreground">
                                One-time purchase · Resume template
                              </div>
                            ) : item.type === "service" || item.type === "voice_clone" ? (
                              <div className="text-sm text-muted-foreground">One-time purchase</div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Users className="h-4 w-4" />
                                  {item.users} user{item.users > 1 ? "s" : ""}
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Calendar className="h-4 w-4" />
                                  {item.billingCycle === "annual"
                                    ? "Annual billing"
                                    : "Monthly billing"}
                                  {item.billingCycle === "annual" && (
                                    <Badge variant="secondary" className="text-xs">
                                      Save 20%
                                    </Badge>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              {item.price > 0 ? `$${item.price.toFixed(2)}` : "Free"}
                              {item.type === "plan" &&
                                (item.billingCycle === "annual" ? "/year" : "/month")}
                            </div>
                            {item.quantity > 1 && item.type === "plan" && (
                              <div className="text-sm text-muted-foreground">
                                Qty: {item.quantity}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    <Separator />

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tax (8%):</span>
                        <span>${tax.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total:</span>
                        <span>${finalTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700 text-sm">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="font-medium">
                          30-day money-back guarantee*
                        </span>
                      </div>
                      <p className="text-green-600 text-xs mt-1">
                        Not satisfied? Get a full refund within 30 days.
                      </p>
                      <p className="text-green-600 text-xs mt-1">
                        *Consumption-based usage beyond your free allotment is
                        non-refundable. See{" "}
                        <Link
                          to="/terms-of-service"
                          className="underline hover:text-green-800"
                        >
                          Terms of Service
                        </Link>{" "}
                        for details.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Payment Form */}
              <div className="lg:order-1">
                <form onSubmit={handleSubmit} className="space-y-6">
                  {finalTotal === 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          No payment required
                        </CardTitle>
                        <CardDescription>
                          Your order total is $0.00. Click below to claim your templates — they'll be ready to apply immediately.
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  )}

                  {finalTotal > 0 && (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Billing Address</CardTitle>
                          <CardDescription>
                            We'll save this to your profile so you don't have to re-enter it next time. You can edit it anytime in Settings → Billing.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <BillingAddressForm
                            value={address}
                            onChange={setAddress}
                            errors={addressErrors}
                            disabled={isProcessing || addressLoading}
                          />
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Payment Method</CardTitle>
                          <CardDescription>
                            Choose how you'd like to pay. All payment information is encrypted and processed by our PCI-compliant payment provider — it never touches our servers.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <RadioGroup
                            value={paymentMethodType}
                            onValueChange={(v) => setPaymentMethodType(v as "card" | "us_bank_account")}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="card" id="pm-card" />
                              <Label htmlFor="pm-card" className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                Credit / Debit Card
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="us_bank_account" id="pm-bank" />
                              <Label htmlFor="pm-bank" className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Bank Account (ACH)
                              </Label>
                            </div>
                          </RadioGroup>

                          {paymentMethodType === "card" && (
                            <div className="bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 border border-brand-purple/20 rounded-lg p-4">
                              <div className="flex items-center gap-2 text-foreground font-medium mb-2">
                                <Shield className="h-4 w-4 text-brand-purple" />
                                Secure Card Payment
                              </div>
                              <p className="text-sm text-muted-foreground mb-3">
                                When you click "Complete Purchase", a secure payment window will open where you can enter your card details.
                              </p>
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>✓ PCI DSS Level 1 compliant</p>
                                <p>✓ 256-bit SSL encryption</p>
                              </div>
                            </div>
                          )}

                          {paymentMethodType === "us_bank_account" && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <div className="flex items-center gap-2 text-blue-800 font-medium mb-2">
                                <Building2 className="h-4 w-4" />
                                Bank Account (ACH)
                              </div>
                              <p className="text-sm text-blue-700 mb-3">
                                Lower fees than credit cards. Click "Complete Purchase" to securely connect your bank account; payments typically clear in 1–3 business days.
                              </p>
                              <div className="text-xs text-blue-600 space-y-1">
                                <p>✓ Lower processing fees</p>
                                <p>✓ Bank-level security and encryption</p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Lock className="h-4 w-4" />
                            <span>Your payment information is secure and encrypted</span>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    size="lg"
                    disabled={isProcessing || addressLoading}
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Processing Payment...
                      </>
                    ) : (
                      <>
                        <DollarSign className="mr-2 h-4 w-4" />
                        {finalTotal === 0
                          ? "Complete Free Order"
                          : `Complete Purchase - $${finalTotal.toFixed(2)}`}
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-muted-foreground text-center">
                    By completing this purchase, you agree to our{" "}
                    <Link to="/terms" className="underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy" className="underline">
                      Privacy Policy
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          </div>
        </div>
</AppShell>
  );
}

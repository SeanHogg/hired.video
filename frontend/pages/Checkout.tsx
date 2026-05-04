import {
  CreditCard,
  Lock,
  Shield,
  CheckCircle2,
  ArrowLeft,
  Users,
  Calendar,
  DollarSign,
  Building2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { billingService } from "@/lib/services/billing-service";
import { unlockTemplate, recordPurchaseOnServer } from "@/lib/template-unlocks";
import { TIER_COPY, TIER_NAME } from "@shared/tier-copy";
import { toast } from "sonner";

// HelcimPay.js global functions (injected by their SDK script)
declare global {
  interface Window {
    appendHelcimPayIframe?: (checkoutToken: string) => void;
    removeHelcimPayIframe?: () => void;
  }
}

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
  // Treat any unknown prefix as a colon inside the descriptor id and fall
  // back to the legacy "template:<id>" → resume interpretation.
  return { kind: "resume", templateId: rest };
}

export default function Checkout() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const { items, getTotalPrice, clearCart } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [billingInfo, setBillingInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "US",
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login?redirect=/checkout");
    }
  }, [isAuthenticated, navigate]);

  // Redirect if cart is empty
  useEffect(() => {
    if (isAuthenticated && items.length === 0) {
      navigate("/pricing");
    }
  }, [items.length, isAuthenticated, navigate]);

  // Handle cancellation from payment provider redirect
  useEffect(() => {
    const cancelled = searchParams.get("cancelled");
    if (cancelled === "true") {
      toast.error("Payment setup was cancelled. You can try again or choose a different payment method.");
      // Clean up the URL by removing the cancelled parameter
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("cancelled");
      const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ""}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams]);

  const handleInputChange = (field: string, value: string) => {
    setBillingInfo((prev) => ({ ...prev, [field]: value }));
  };

  const fulfillTemplates = () => {
    // Cart item id formats accepted (back-compat with the original
    // resume-only flow where the kind was implicit):
    //   • "template:<descriptorId>"             → kind = "resume"  (legacy)
    //   • "template:resume:<descriptorId>"      → kind = "resume"
    //   • "template:job:<descriptorId>"         → kind = "job"
    //   • "template:studio:<uuid>"              → kind = "studio"
    for (const item of items) {
      if (item.type !== "template") continue;
      const { kind, templateId } = parseTemplateCartId(item.id);
      // Optimistic local unlock so the next page render reflects ownership.
      unlockTemplate(templateId, kind);
      // Server-truth grant. Idempotent on the API side, so the webhook
      // landing later doesn't double-record.
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
      // $0 cart — skip payment entirely
      if (getTotalPrice() === 0) {
        fulfillTemplates();
        clearCart();
        toast.success("Templates unlocked — they're yours to use.");
        navigate("/resumes");
        return;
      }

      const successUrl = `${window.location.origin}/checkout/success`;
      const cancelUrl = `${window.location.origin}/checkout?cancelled=true`;

      const result = await billingService.initPaymentCollection(
        successUrl,
        cancelUrl,
        finalTotal,
        "USD",
      );

      if (result.flowType === "redirect" && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }

      // Helcim provider — use HelcimPay.js modal flow
      if (result.providerName === "helcim" && result.checkoutToken && result.sdkScriptUrl) {
        // Dynamically load the HelcimPay.js SDK
        await new Promise<void>((resolve, reject) => {
          if (document.querySelector(`script[src="${result.sdkScriptUrl}"]`)) {
            resolve();
            return;
          }
          const script = document.createElement("script");
          script.src = result.sdkScriptUrl!;
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load HelcimPay.js"));
          document.head.appendChild(script);
        });

        if (!window.appendHelcimPayIframe) {
          throw new Error("HelcimPay.js failed to initialize");
        }

        // Listen for the result from the Helcim iFrame
        const messageHandler = (event: MessageEvent) => {
          const data = event.data;
          if (!data || typeof data !== "object") return;

          if (data.eventName === "helcim-pay-success" || data.eventStatus === "APPROVED") {
            window.removeEventListener("message", messageHandler);
            try { window.removeHelcimPayIframe?.(); } catch {}

            // Payment succeeded — fulfill and navigate
            fulfillTemplates();
            clearCart();
            toast.success(`Payment successful! ${TIER_COPY.welcomeAfterCheckout()} 🎉`);
            navigate("/dashboard");
          } else if (
            data.eventName === "helcim-pay-error" ||
            data.eventName === "helcim-pay-abort" ||
            data.eventStatus === "ABORTED"
          ) {
            window.removeEventListener("message", messageHandler);
            try { window.removeHelcimPayIframe?.(); } catch {}
            setIsProcessing(false);
            toast.error(data.message || "Payment was cancelled. Please try again.");
          }
        };

        window.addEventListener("message", messageHandler);
        window.appendHelcimPayIframe(result.checkoutToken);
        return; // Don't set isProcessing=false; the message handler will
      }

      // Fallback for Stripe or other embedded flows
      fulfillTemplates();
      clearCart();
      toast.success(`Payment successful! ${TIER_COPY.welcomeAfterCheckout()} 🎉`);
      navigate("/dashboard");
    } catch (error) {
      console.error("Payment processing error:", error);
      toast.error("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const totalPrice = getTotalPrice();
  const tax = totalPrice * 0.08; // 8% tax
  const finalTotal = totalPrice + tax;

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  if (items.length === 0) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16 min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
          <div className="max-w-6xl mx-auto p-6">
            {/* Header */}
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
                  {/* Billing Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Billing Information</CardTitle>
                      <CardDescription>
                        This information will be used for your invoice
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input
                            id="firstName"
                            value={billingInfo.firstName}
                            onChange={(e) =>
                              handleInputChange("firstName", e.target.value)
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name *</Label>
                          <Input
                            id="lastName"
                            value={billingInfo.lastName}
                            onChange={(e) =>
                              handleInputChange("lastName", e.target.value)
                            }
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={billingInfo.email}
                          onChange={(e) =>
                            handleInputChange("email", e.target.value)
                          }
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          value={billingInfo.company}
                          onChange={(e) =>
                            handleInputChange("company", e.target.value)
                          }
                        />
                      </div>

                      <div>
                        <Label htmlFor="address">Address *</Label>
                        <Input
                          id="address"
                          value={billingInfo.address}
                          onChange={(e) =>
                            handleInputChange("address", e.target.value)
                          }
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={billingInfo.city}
                            onChange={(e) =>
                              handleInputChange("city", e.target.value)
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="state">State *</Label>
                          <Input
                            id="state"
                            value={billingInfo.state}
                            onChange={(e) =>
                              handleInputChange("state", e.target.value)
                            }
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="zipCode">ZIP Code *</Label>
                          <Input
                            id="zipCode"
                            value={billingInfo.zipCode}
                            onChange={(e) =>
                              handleInputChange("zipCode", e.target.value)
                            }
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="country">Country *</Label>
                          <Select
                            value={billingInfo.country}
                            onValueChange={(value) =>
                              handleInputChange("country", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="US">United States</SelectItem>
                              <SelectItem value="CA">Canada</SelectItem>
                              <SelectItem value="GB">United Kingdom</SelectItem>
                              <SelectItem value="AU">Australia</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payment Method */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Payment Method</CardTitle>
                      <CardDescription>
                        Choose your preferred payment method. All payment information is encrypted and secure.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <RadioGroup
                        value={paymentMethod}
                        onValueChange={setPaymentMethod}
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="card" id="card" />
                          <Label
                            htmlFor="card"
                            className="flex items-center gap-2"
                          >
                            <CreditCard className="h-4 w-4" />
                            Credit/Debit Card
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="us_bank_account" id="bank" />
                          <Label
                            htmlFor="bank"
                            className="flex items-center gap-2"
                          >
                            <Building2 className="h-4 w-4" />
                            Bank Account (ACH)
                          </Label>
                        </div>
                      </RadioGroup>

                      {paymentMethod === "card" && (
                        <div className="space-y-4 pt-4 border-t">
                          <div className="bg-gradient-to-r from-brand-purple/5 to-brand-blue/5 border border-brand-purple/20 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-foreground font-medium mb-2">
                              <Shield className="h-4 w-4 text-brand-purple" />
                              Secure Payment
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">
                              When you click "Complete Purchase", a secure payment window will open where you can safely enter your card details. Your card information is handled directly by our PCI-compliant payment processor — it never touches our servers.
                            </p>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>✓ PCI DSS Level 1 compliant</p>
                              <p>✓ 256-bit SSL encryption</p>
                              <p>✓ Card data never stored on our servers</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {paymentMethod === "us_bank_account" && (
                        <div className="space-y-4 pt-4 border-t">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-blue-800 font-medium mb-2">
                              <Building2 className="h-4 w-4" />
                              Bank Account Setup
                            </div>
                            <p className="text-sm text-blue-700 mb-3">
                              Bank account payments are processed securely. When you click "Complete Purchase", you'll be redirected to a secure page to connect your bank account.
                            </p>
                            <div className="text-xs text-blue-600 space-y-1">
                              <p>✓ Lower processing fees than credit cards</p>
                              <p>✓ Payments typically process in 1-3 business days</p>
                              <p>✓ Bank-level security and encryption</p>
                              <p>✓ You can cancel the setup at any time and return here</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        <span>
                          Your payment information is secure and encrypted
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                    </>
                  )}

                  {/* Submit Button */}
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    size="lg"
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        {paymentMethod === "us_bank_account" ? "Redirecting..." : "Processing Payment..."}
                      </>
                    ) : (
                      <>
                        <DollarSign className="mr-2 h-4 w-4" />
                        {finalTotal === 0
                          ? "Complete Free Order"
                          : paymentMethod === "us_bank_account"
                          ? `Set Up Bank Account - $${finalTotal.toFixed(2)}`
                          : `Complete Purchase - $${finalTotal.toFixed(2)}`
                        }
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
        <Footer />
      </div>
    </div>
  );
}

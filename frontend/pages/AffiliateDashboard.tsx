import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import affiliateService, { type DashboardData } from "@/lib/services/affiliate-service";
import { billingService, type PaymentMethod } from "@/lib/services/billing-service";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DollarSign, CheckCircle2, Clock, CreditCard, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Content component that can be used with or without layout
function AffiliateDashboardContent() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<{ referralCode: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Protect route: affiliate role only
    // Backend roles include Affiliate = 50; frontend may have string roles; be permissive here and rely on backend auth too
    if (!isAuthenticated) {
      navigate("/login?next=/services");
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        // Ensure profile exists (generates referral code if missing)
        const prof = await affiliateService.getProfile();
        setProfile({ referralCode: prof.referralCode });
        const dashboard = await affiliateService.getDashboard();
        setData(dashboard);
      } catch (e) {
        console.error("Failed to load affiliate dashboard", e);
        setError(t("errors.loadAffiliateDashboardFailed"));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load payment methods
  useEffect(() => {
    const loadPaymentMethods = async () => {
      try {
        setPaymentMethodsLoading(true);
        const methods = await billingService.getPaymentMethods();
        setPaymentMethods(methods);
      } catch (e) {
        console.error("Failed to load payment methods", e);
        // Don't show error for payment methods as it's not critical for viewing the dashboard
      } finally {
        setPaymentMethodsLoading(false);
      }
    };
    loadPaymentMethods();
  }, []);

  // Handle payment method setup success
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pm_success') === 'true') {
      toast({
        title: t("messages.paymentMethodAddedTitle"),
        description: t("messages.paymentMethodAddedDesc"),
      });
      // Clean up URL — preserve tab param if present
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete('pm_success');
      const cleanSearch = cleanParams.toString();
      window.history.replaceState({}, '', window.location.pathname + (cleanSearch ? `?${cleanSearch}` : ''));
      // Reload payment methods
      const reloadPaymentMethods = async () => {
        try {
          const methods = await billingService.getPaymentMethods();
          setPaymentMethods(methods);
        } catch (e) {
          console.error("Failed to reload payment methods", e);
        }
      };
      reloadPaymentMethods();
    }
  }, [toast]);

  const cents = (v: number | undefined) => (typeof v === "number" ? (v / 100).toFixed(2) : "0.00");

  const requestPayout = async () => {
    try {
      setPayoutMessage(null);
      const res = await affiliateService.requestPayout();
      setPayoutMessage(t("messages.payoutRequestedSuccess", { amount: cents(res.amountCents) }));
      // Reload dashboard after payout
      const dashboard = await affiliateService.getDashboard();
      setData(dashboard);
    } catch (e: any) {
      console.error("Payout request failed", e);
      setPayoutMessage(typeof e?.message === "string" ? e.message : t("errors.payoutRequestFailed"));
    }
  };

  const handleAddPaymentMethod = async () => {
    try {
      setPaymentMethodsLoading(true);
      const successUrl = `${window.location.origin}/services?pm_success=true`;
      const cancelUrl = `${window.location.origin}/services`;
      const setupUrl = await billingService.createSetupSession(successUrl, cancelUrl);
      window.location.href = setupUrl;
    } catch (e) {
      console.error("Failed to create payment method setup session", e);
      toast({
        title: t("labels.error"),
        description: t("errors.setupPaymentMethodFailed"),
        variant: "destructive",
      });
    } finally {
      setPaymentMethodsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("headings.affiliateDashboard")}</h1>
        <Button variant="outline" onClick={() => navigate("/affiliate-program")}>{t("labels.affiliateProgram")}</Button>
      </div>


	            {/* Not an affiliate notice */}
	            {user && !loading && !profile && (
	              <Card>
	                <CardHeader>
	                  <CardTitle>{t("headings.becomeAffiliate")}</CardTitle>
	                </CardHeader>
	                <CardContent>
	                  <p className="text-sm text-muted-foreground">
	                    {t("messages.notEnrolledAffiliate")}
	                  </p>
	                  <Button className="mt-3" onClick={() => navigate("/affiliate-program")}>{t("actions.learnMoreAndJoin")}</Button>
	                </CardContent>
	              </Card>
	            )}

            {error && <div className="text-red-600 text-sm">{error}</div>}

            {/* Referral link */}
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.yourReferralLink")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <input
                    className="flex-1 border rounded px-3 py-2 text-sm"
                    value={`${window.location.origin}/signup?ref=${profile?.referralCode ?? ""}`}
                    readOnly
                  />
                  <Button
                    type="button"
                    onClick={async () => {
                      try {
                        const link = `${window.location.origin}/signup?ref=${profile?.referralCode ?? ""}`;
                        await navigator.clipboard.writeText(link);
                        toast({
                          title: t("messages.linkCopiedTitle"),
                          description: t("messages.referralLinkCopied"),
                        });
                      } catch (err) {
                        console.error("Failed to copy referral link:", err);
                        toast({
                          title: t("errors.copyFailed"),
                          description: t("errors.copyReferralLinkFailed"),
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    {t("actions.copyLink")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {t("messages.referralCommissionHint")}
                </p>
              </CardContent>
            </Card>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><DollarSign className="h-5 w-5 mr-2" /> {t("headings.pendingEarnings")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">${cents(data?.totals.pendingCents as any)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><CheckCircle2 className="h-5 w-5 mr-2" /> {t("headings.paidEarnings")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">${cents(data?.totals.paidCents as any)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><Clock className="h-5 w-5 mr-2" /> {t("headings.threshold")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{t("messages.minPayoutThreshold")}</p>

                  {/* Check if payment methods are configured */}
                  {paymentMethods.length === 0 && !paymentMethodsLoading ? (
                    <Alert className="mt-3">
                      <CreditCard className="h-4 w-4" />
                      <AlertDescription>
                        {t("messages.addPaymentMethodRequired")}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {paymentMethods.length === 0 ? (
                    <Button
                      className="mt-3"
                      onClick={handleAddPaymentMethod}
                      disabled={paymentMethodsLoading}
                      variant="outline"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      {paymentMethodsLoading ? t("status.settingUp") : t("actions.addPaymentMethod")}
                    </Button>
                  ) : (
                    <Button
                      className="mt-3"
                      onClick={requestPayout}
                      disabled={(data?.totals.pendingCents ?? 0) < 2500}
                    >
                      {t("actions.requestPayout")}
                    </Button>
                  )}

                  {payoutMessage && <p className="text-sm mt-2">{payoutMessage}</p>}
                </CardContent>
              </Card>
            </div>

            {/* Referrals */}
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.referredUsers")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">{t("labels.userId")}</th>
                        <th className="py-2 pr-4">{t("labels.referralCode")}</th>
                        <th className="py-2 pr-4">{t("labels.referredAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.referrals?.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{r.referredUserId}</td>
                          <td className="py-2 pr-4">{r.referralCode}</td>
                          <td className="py-2 pr-4">{new Date(r.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(!data?.referrals?.length) && (
                        <tr>
                          <td className="py-3 text-muted-foreground" colSpan={3}>{t("messages.noReferralsYet")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Conversions */}
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.conversionsAndEarnings")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">{t("labels.userId")}</th>
                        <th className="py-2 pr-4">{t("labels.subscription")}</th>
                        <th className="py-2 pr-4">{t("labels.commission")}</th>
                        <th className="py-2 pr-4">{t("labels.statusColumn")}</th>
                        <th className="py-2 pr-4">{t("labels.dateColumn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.conversions?.map((c) => (
                        <tr key={c.id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{c.referredUserId}</td>
                          <td className="py-2 pr-4">${cents(c.subscriptionAmountCents)}</td>
                          <td className="py-2 pr-4">${cents(c.commissionAmountCents)}</td>
                          <td className="py-2 pr-4">{String(c.status)}</td>
                          <td className="py-2 pr-4">{new Date(c.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(!data?.conversions?.length) && (
                        <tr>
                          <td className="py-3 text-muted-foreground" colSpan={5}>{t("messages.noConversionsYet")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Payout History */}
            <Card>
              <CardHeader>
                <CardTitle>{t("headings.payoutHistory")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">{t("labels.payoutId")}</th>
                        <th className="py-2 pr-4">{t("labels.amount")}</th>
                        <th className="py-2 pr-4">{t("labels.statusColumn")}</th>
                        <th className="py-2 pr-4">{t("labels.requested")}</th>
                        <th className="py-2 pr-4">{t("labels.paid")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.payouts?.map((p) => (
                        <tr key={p.id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{p.id}</td>
                          <td className="py-2 pr-4">${cents(p.amountCents)}</td>
                          <td className="py-2 pr-4">{String(p.status)}</td>
                          <td className="py-2 pr-4">{new Date(p.requestedAt).toLocaleString()}</td>
                          <td className="py-2 pr-4">{p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                      {(!data?.payouts || data.payouts.length === 0) && (
                        <tr>
                          <td className="py-3 text-muted-foreground" colSpan={5}>{t("messages.noPayoutHistory")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
    </div>
  );
}

// Full page component with layout (for direct route access)
export default function AffiliateDashboard() {
  useSEO("/affiliate/dashboard");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16">
          <section className="max-w-6xl mx-auto px-6 py-10">
            <AffiliateDashboardContent />
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}

// Export the content component for use in main Dashboard
export { AffiliateDashboardContent };


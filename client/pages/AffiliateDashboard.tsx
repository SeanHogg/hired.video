import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { useEffect, useState } from "react";
import affiliateService, { type DashboardData } from "@/lib/services/affiliate-service";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DollarSign, CheckCircle2, Clock } from "lucide-react";

export default function AffiliateDashboard() {
  useSEO("/affiliate/dashboard");
  const { isAuthenticated, user } = useAuth();
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const navigate = useNavigate();

  const [data, setData] = useState<DashboardData | null>(null);
  const [profile, setProfile] = useState<{ referralCode: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);

  useEffect(() => {
    // Protect route: affiliate role only
    // Backend roles include Affiliate = 50; frontend may have string roles; be permissive here and rely on backend auth too
    if (!isAuthenticated) {
      navigate("/login?next=/affiliate/dashboard");
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
        setError("Failed to load affiliate dashboard.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const cents = (v: number | undefined) => (typeof v === "number" ? (v / 100).toFixed(2) : "0.00");

  const requestPayout = async () => {
    try {
      setPayoutMessage(null);
      const res = await affiliateService.requestPayout();
      setPayoutMessage(`Payout requested successfully for $${cents(res.amountCents)}.`);
      // Reload dashboard after payout
      const dashboard = await affiliateService.getDashboard();
      setData(dashboard);
    } catch (e: any) {
      console.error("Payout request failed", e);
      setPayoutMessage(typeof e?.message === "string" ? e.message : "Payout request failed");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16">
          <section className="max-w-6xl mx-auto px-6 py-10 space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">Affiliate Dashboard</h1>
              <Button variant="outline" onClick={() => navigate("/affiliate-program")}>Affiliate Program</Button>
            </div>


	            {/* Not an affiliate notice */}
	            {user && !loading && !profile && (
	              <Card>
	                <CardHeader>
	                  <CardTitle>Become an Affiliate</CardTitle>
	                </CardHeader>
	                <CardContent>
	                  <p className="text-sm text-muted-foreground">
	                    You’re logged in but not enrolled as an affiliate yet. Join our Affiliate Program and earn 25% from the first-month subscription of every referral.
	                  </p>
	                  <Button className="mt-3" onClick={() => navigate("/affiliate-program")}>Learn more & join</Button>
	                </CardContent>
	              </Card>
	            )}

            {error && <div className="text-red-600 text-sm">{error}</div>}

            {/* Referral link */}
            <Card>
              <CardHeader>
                <CardTitle>Your Referral Link</CardTitle>
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
                    onClick={() => {
                      const link = `${window.location.origin}/signup?ref=${profile?.referralCode ?? ""}`;
                      navigator.clipboard.writeText(link);
                    }}
                  >
                    Copy Link
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Share this link to earn a one-time 25% commission on your referral’s first month subscription.
                </p>
              </CardContent>
            </Card>

            {/* Totals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><DollarSign className="h-5 w-5 mr-2" /> Pending Earnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">${cents(data?.totals.pendingCents as any)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><CheckCircle2 className="h-5 w-5 mr-2" /> Paid Earnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">${cents(data?.totals.paidCents as any)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center"><Clock className="h-5 w-5 mr-2" /> Threshold</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Minimum payout threshold: $25.00</p>
                  <Button className="mt-3" onClick={requestPayout} disabled={(data?.totals.pendingCents ?? 0) < 2500}>
                    Request Payout
                  </Button>
                  {payoutMessage && <p className="text-sm mt-2">{payoutMessage}</p>}
                </CardContent>
              </Card>
            </div>

            {/* Referrals */}
            <Card>
              <CardHeader>
                <CardTitle>Referred Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">User ID</th>
                        <th className="py-2 pr-4">Referral Code</th>
                        <th className="py-2 pr-4">Referred At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.referrals.map((r) => (
                        <tr key={r.id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{r.referredUserId}</td>
                          <td className="py-2 pr-4">{r.referralCode}</td>
                          <td className="py-2 pr-4">{new Date(r.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(!data || data.referrals.length === 0) && (
                        <tr>
                          <td className="py-3 text-muted-foreground" colSpan={3}>No referrals yet.</td>
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
                <CardTitle>Conversions & Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">User ID</th>
                        <th className="py-2 pr-4">Subscription</th>
                        <th className="py-2 pr-4">Commission</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.conversions.map((c) => (
                        <tr key={c.id} className="border-b last:border-b-0">
                          <td className="py-2 pr-4">{c.referredUserId}</td>
                          <td className="py-2 pr-4">${cents(c.subscriptionAmountCents)}</td>
                          <td className="py-2 pr-4">${cents(c.commissionAmountCents)}</td>
                          <td className="py-2 pr-4">{String(c.status)}</td>
                          <td className="py-2 pr-4">{new Date(c.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                      {(!data || data.conversions.length === 0) && (
                        <tr>
                          <td className="py-3 text-muted-foreground" colSpan={5}>No conversions yet.</td>
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
                <CardTitle>Payout History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 pr-4">Payout ID</th>
                        <th className="py-2 pr-4">Amount</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Requested</th>
                        <th className="py-2 pr-4">Paid</th>
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
                          <td className="py-3 text-muted-foreground" colSpan={5}>No payout history yet.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}


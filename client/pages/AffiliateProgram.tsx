import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { useSEO } from "@/lib/seo";
import { useSidebar } from "@/hooks/use-sidebar";

export default function AffiliateProgram() {
  useSEO("/affiliate-program");
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />
        <main className="pt-16">
          <section className="max-w-4xl mx-auto p-6 space-y-4">
            <h1 className="text-3xl font-bold">Affiliate Program</h1>
            <p>Earn 25% commission on the first month of any referral's subscription. Minimum payout $25.00.</p>
            <p>Share your referral link with your audience. When they sign up and purchase their first month, you get paid.</p>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  );
}


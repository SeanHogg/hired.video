import { ArrowLeft, Building2 } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { companyService } from "@/lib/services/company-service";
import type { CompanyProfile } from "@/lib/services/company-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import CompanyBuilder from "@/components/company/CompanyBuilder";

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated } = useAuth();

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Fetch company data
  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);
        setAccessDenied(false);
        const companyData = await companyService.getCompanyProfileById(id);

        // Check access control
        if (!companyData.canEdit && !companyData.isOwner) {
          setAccessDenied(true);
          return;
        }

        setCompany(companyData);
      } catch (err) {
        console.error("Failed to fetch company:", err);
        setError("Failed to load company. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Handle access denied
  if (accessDenied) {
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
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
              <p className="text-muted-foreground mb-6">
                You don't have permission to edit this company profile.
              </p>
              <Button asChild>
                <Link to="/companies">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Companies
                </Link>
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // Handle loading state
  if (isLoading) {
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
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-1/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  // Handle error state
  if (error || !company) {
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
          <div className="pt-16 p-6">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-2xl font-bold mb-4">Company Not Found</h1>
              <p className="text-muted-foreground mb-6">
                {error || "The company you're looking for doesn't exist."}
              </p>
              <Button asChild>
                <Link to="/companies">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Companies
                </Link>
              </Button>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
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

        <div className="pt-16 p-6">
          <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <div className="mb-6">
              <Button asChild variant="outline">
                <Link to={`/companies/${company.id}`}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Company
                </Link>
              </Button>
            </div>

            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold">
                    Edit: {company.data.name}
                  </h1>
                </div>
              </div>
              <p className="text-muted-foreground">
                Update your company information, culture, benefits, and team details. Changes are saved automatically.
              </p>
            </div>

            <CompanyBuilder
              company={company}
              onSave={(updated) => setCompany(updated)}
              onCancel={() => navigate(`/companies/${company.id}`)}
            />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

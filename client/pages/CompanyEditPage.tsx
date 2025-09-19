import { Edit, ArrowLeft, Building2 } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { companyService } from "@/lib/services/company-service";
import type { CompanyProfile } from "@/lib/services/company-service";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user } = useAuth();

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch company data
  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        setError(null);
        const companyData = await companyService.getCompanyProfileById(id);
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
                <Link to={company ? `/companies/${company.id}` : "/companies"}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {company ? "Back to Company" : "Back to Companies"}
                </Link>
              </Button>
            </div>

            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">
                {company
                  ? `Edit: ${company.data.name}`
                  : "Edit Company Profile"}
              </h1>
              <p className="text-muted-foreground">
                Update your company information, culture, benefits, and team
                details
              </p>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Edit className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  Company Editor Coming Soon
                </h3>
                <p className="text-muted-foreground mb-6">
                  We're building a comprehensive company profile editor with
                  real-time preview, team collaboration, and advanced
                  customization options.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button asChild>
                    <Link
                      to={company ? `/companies/${company.id}` : "/companies"}
                    >
                      {company ? "View Company" : "View Companies"}
                    </Link>
                  </Button>
                  <Button variant="outline">Request Early Access</Button>
                </div>
              </CardContent>
            </Card>

            {/* Current Company Info Preview */}
            {company && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4">
                  Current Company Information
                </h2>
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle>{company.data.name}</CardTitle>
                        <CardDescription>
                          {company.data.tagline}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Industry:</span>
                        <span className="ml-2 font-medium">
                          {company.data.industry}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Size:</span>
                        <span className="ml-2 font-medium">
                          {company.data.size} employees
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <span className="ml-2 font-medium">
                          {company.data.headquarters.city},{" "}
                          {company.data.headquarters.state}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <span className="ml-2 font-medium capitalize">
                          {company.status}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}

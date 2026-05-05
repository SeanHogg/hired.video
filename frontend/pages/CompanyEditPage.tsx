import { ArrowLeft, Building2 } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { companyService } from "@/lib/services/company-service";
import type { CompanyProfile } from "@/lib/services/company-service";
import { useAuth } from "@/lib/auth";
import CompanyBuilder from "@/components/company/CompanyBuilder";

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!id) return;
      try {
        setIsLoading(true);
        setError(null);
        setAccessDenied(false);
        const companyData = await companyService.getCompanyProfileById(id);
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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (accessDenied) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-4 md:p-6 text-center">
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
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !company) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-4 md:p-6 text-center">
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
      </AppShell>
    );
  }

  const tabs: PageHeaderTab[] = [
    { key: "companies", label: "Companies", icon: Building2, to: "/companies" },
    { key: "company", label: company.data.name, to: `/companies/${company.id}` },
    { key: "edit", label: "Edit" },
  ];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <PageHeader
          tabs={tabs}
          activeTabKey="edit"
          title={`Edit ${company.data.name}`}
          description="Update your company information, culture, benefits, and team details. Changes are saved automatically."
          actions={
            <Button asChild variant="outline">
              <Link to={`/companies/${company.id}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Company
              </Link>
            </Button>
          }
        />

        <CompanyBuilder
          company={company}
          onSave={(updated) => setCompany(updated)}
          onCancel={() => navigate(`/companies/${company.id}`)}
        />
      </div>
    </AppShell>
  );
}

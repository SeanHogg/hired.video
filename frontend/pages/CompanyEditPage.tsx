import { Building2 } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import EntityEditShell from "@/components/EntityEditShell";
import { companyService } from "@/lib/services/company-service";
import type { CompanyProfile } from "@/lib/services/company-service";
import { useAuth } from "@/lib/auth";
import { useEntityOwnership } from "@/lib/use-entity-ownership";
import CompanyBuilder from "@/components/company/CompanyBuilder";

export default function CompanyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { isOwner } = useEntityOwnership({ ownerUserId: company?.userId });
  const accessDenied = !!company && !isOwner;

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

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <EntityEditShell
      hubEntity="company"
      parent={{ label: "Companies", to: "/companies", icon: Building2 }}
      entity={{
        label: company?.data.name,
        to: company ? `/companies/${company.id}` : undefined,
      }}
      description="Update your company information, culture, benefits, and team details. Changes are saved automatically."
      loading={isLoading}
      accessDenied={accessDenied}
      accessDeniedMessage="You don't have permission to edit this company profile."
      notFound={!isLoading && !accessDenied && (!!error || !company)}
      notFoundMessage={error ?? "The company you're looking for doesn't exist."}
    >
      {company && (
        <CompanyBuilder
          company={company}
          onSave={(updated) => setCompany(updated)}
          onCancel={() => navigate(`/companies/${company.id}`)}
        />
      )}
    </EntityEditShell>
  );
}

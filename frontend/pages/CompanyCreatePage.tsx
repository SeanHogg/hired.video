import { Building2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import EntityEditShell from "@/components/EntityEditShell";
import { useAuth } from "@/lib/auth";
import CompanyBuilder from "@/components/company/CompanyBuilder";

export default function CompanyCreatePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, isLoading, navigate]);

  // Mirror /resumes/create/:id and /jobs/create/:id — assign a client-side
  // id to the URL on first load so refresh / back / share-link all resolve
  // to the same draft. The server replaces it with the canonical UUID on
  // first save (CompanyBuilder calls onSave with the persisted entity).
  useEffect(() => {
    if (!id) {
      navigate(`/companies/create/${crypto.randomUUID()}`, { replace: true });
    }
  }, [id, navigate]);

  return (
    <EntityEditShell
      parent={{ label: "Companies", to: "/companies", icon: Building2, singular: "Company" }}
      entity={{}}
      leafLabel="Create"
      description="Set up your company profile to attract candidates and showcase your culture. You can keep editing after the first save."
    >
      <CompanyBuilder
        company={null}
        onSave={(created) => navigate(`/companies/${created.id}`)}
        onCancel={() => navigate("/companies")}
      />
    </EntityEditShell>
  );
}

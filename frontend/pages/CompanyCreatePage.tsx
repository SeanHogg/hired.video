import { ArrowLeft, Building2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import CompanyBuilder from "@/components/company/CompanyBuilder";

export default function CompanyCreatePage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate("/login");
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <AppShell>
      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button asChild variant="outline">
              <Link to="/companies">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Companies
              </Link>
            </Button>
          </div>

          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <h1 className="text-3xl font-bold">Create Company</h1>
            </div>
            <p className="text-muted-foreground">
              Set up your company profile to attract candidates and showcase your culture. You can keep editing after the first save.
            </p>
          </div>

          <CompanyBuilder
            company={null}
            onSave={(created) => navigate(`/companies/${created.id}`)}
            onCancel={() => navigate("/companies")}
          />
        </div>
      </div>
    </AppShell>
  );
}

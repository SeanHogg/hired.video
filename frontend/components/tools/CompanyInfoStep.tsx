import { useState } from "react";
import { ArrowLeft, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CompanyData {
  name?: string;
  mission?: string;
  values?: string;
}

interface CompanyInfoStepProps {
  onCompanyInfoSubmitted: (data: CompanyData) => void;
  isLoading?: boolean;
  onBack: () => void;
}

export default function CompanyInfoStep({
  onCompanyInfoSubmitted,
  isLoading = false,
  onBack,
}: CompanyInfoStepProps) {
  const [companyName, setCompanyName] = useState("");
  const [companyMission, setCompanyMission] = useState("");
  const [companyValues, setCompanyValues] = useState("");

  const handleSubmit = () => {
    // Company info is optional, but at least company name is recommended
    onCompanyInfoSubmitted({
      name: companyName.trim() || undefined,
      mission: companyMission.trim() || undefined,
      values: companyValues.trim() || undefined,
    });
  };

  const handleSkip = () => {
    onCompanyInfoSubmitted({});
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Optional: Add company details to create a more personalized value
            proposition
          </p>
        </div>
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Alert>
        <Building2 className="h-4 w-4" />
        <AlertDescription>
          Adding company information helps create a more targeted and compelling
          value proposition. You can skip this step if you don't have this
          information available.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Company Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              placeholder="e.g., Acme Corporation"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              The name of the company you're applying to
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyMission">Company Mission (Optional)</Label>
            <Textarea
              id="companyMission"
              placeholder="e.g., To revolutionize the way people work by providing innovative solutions that enhance productivity and collaboration..."
              value={companyMission}
              onChange={(e) => setCompanyMission(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              The company's mission statement or purpose
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyValues">Company Values (Optional)</Label>
            <Textarea
              id="companyValues"
              placeholder="e.g., Innovation, Integrity, Customer Focus, Teamwork, Excellence..."
              value={companyValues}
              onChange={(e) => setCompanyValues(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              The company's core values or principles
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={handleSkip} disabled={isLoading}>
          Skip This Step
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          className="min-w-[140px]"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Value Proposition"
          )}
        </Button>
      </div>
    </div>
  );
}

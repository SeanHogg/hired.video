import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Loader2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

interface LeadGenerationSettingsTabProps {
  providesServices: boolean;
  loading: boolean;
  saving: boolean;
  onToggle: (checked: boolean) => void;
}

export function LeadGenerationSettingsTab({
  providesServices,
  loading,
  saving,
  onToggle,
}: LeadGenerationSettingsTabProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("headings.leadGeneration")}</CardTitle>
        <CardDescription>
          {t("messages.leadGenerationDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {providesServices ? (
                  <ToggleRight className="h-5 w-5 text-sky-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="font-medium">{t("settings.leadGeneration.provideServicesLabel")}</p>
                  <p className="text-sm text-muted-foreground">
                    {providesServices
                      ? t("settings.leadGeneration.servicesPublicDesc")
                      : t("settings.leadGeneration.servicesHiddenDesc")}
                  </p>
                </div>
              </div>
              <Switch
                checked={providesServices}
                onCheckedChange={onToggle}
                disabled={saving}
              />
            </div>

            <div className="border-t pt-4">
              <Link to="/services">
                <Button variant="outline" className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  {t("actions.manageServiceOfferings")}
                </Button>
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

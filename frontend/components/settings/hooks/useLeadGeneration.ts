import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { servicesService } from "@/lib/services/services-service";
import { userService } from "@/lib/services/user-service";

/** "Provide services" (Lead Generation) toggle — lazy-loaded when its tab is active. */
export function useLeadGeneration(isAuthenticated: boolean, activeTab: string) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [providesServices, setProvidesServices] = useState(false);
  const [providesServicesLoading, setProvidesServicesLoading] = useState(false);
  const [providesServicesSaving, setProvidesServicesSaving] = useState(false);

  // Lazy-load Lead Generation status when its tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "lead-generation") return;

    setProvidesServicesLoading(true);
    (async () => {
      try {
        const profile = await userService.getCurrentUser();
        setProvidesServices(profile.providesServices ?? false);
      } catch {
        // ignore: verification gate or transient failure
      } finally {
        setProvidesServicesLoading(false);
      }
    })();
  }, [isAuthenticated, activeTab]);

  async function handleToggleProvider(checked: boolean) {
    setProvidesServicesSaving(true);
    try {
      await servicesService.toggleProvideServices(checked);
      setProvidesServices(checked);
      toast({
        title: checked
          ? t("messages.leadGenEnabled")
          : t("messages.leadGenDisabled"),
      });
    } catch {
      toast({ title: t("errors.updateSettingFailed"), variant: "destructive" });
    } finally {
      setProvidesServicesSaving(false);
    }
  }

  return { providesServices, providesServicesLoading, providesServicesSaving, handleToggleProvider };
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/hooks/use-toast";

/**
 * Local opt-in flag for the Featured Company Profile waitlist. Persisted in
 * localStorage so the CTA becomes a confirmation after first click and we
 * don't pester the user. Replace with a server call once the endpoint ships.
 */
const FEATURED_PROFILE_INTEREST_KEY = "outreach.featuredProfile.interest";

export function useFeaturedProfileInterest() {
  const { t } = useTranslation();
  const [featuredProfileInterest, setFeaturedProfileInterest] = useState(false);
  useEffect(() => {
    try {
      setFeaturedProfileInterest(
        localStorage.getItem(FEATURED_PROFILE_INTEREST_KEY) === "1",
      );
    } catch {
      /* SSR / privacy-mode — treat as not opted in */
    }
  }, []);
  const handleFeaturedProfileInterest = () => {
    try {
      localStorage.setItem(FEATURED_PROFILE_INTEREST_KEY, "1");
    } catch {
      /* best-effort */
    }
    setFeaturedProfileInterest(true);
    toast({
      title: t("messages.featuredOnList"),
      description: t("messages.featuredEmailWhenAvailable"),
    });
  };
  return { featuredProfileInterest, handleFeaturedProfileInterest };
}

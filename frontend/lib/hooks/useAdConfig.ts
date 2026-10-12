import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api-client";

export interface AdConfig {
  adsEnabled: boolean;
  publisherId: string;
  slots: Record<string, string>;
}

const DISABLED: AdConfig = { adsEnabled: false, publisherId: "", slots: {} };

let cache: AdConfig | null = null;

export function useAdConfig(): AdConfig & { loading: boolean } {
  const [config, setConfig] = useState<AdConfig>(cache ?? DISABLED);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    if (cache !== null) return;
    apiClient
      .get<AdConfig>("/api/ads/config")
      .then((res) => {
        cache = res.data;
        setConfig(res.data);
      })
      .catch(() => {
        cache = DISABLED;
        setConfig(DISABLED);
      })
      .finally(() => setLoading(false));
  }, []);

  return { ...config, loading };
}

// Live data for a /sectors/:sector landing page: top public jobs + latest
// articles for the sector. Skips the jobs fetch for content-only sectors
// since `politics_civic` has no recruitable jobs by design.

import { useEffect, useState } from "react";
import type { Sector } from "@shared/sectors";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { articleService, type PublicArticleCard } from "@/lib/services/article-service";

export interface SectorLiveData {
  jobs: JobSummary[];
  articles: PublicArticleCard[];
  loading: boolean;
}

export function useSectorLiveData(sector: Sector, contentOnly: boolean): SectorLiveData {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [articles, setArticles] = useState<PublicArticleCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const jobsPromise = contentOnly
      ? Promise.resolve({ items: [] as JobSummary[] })
      : jobService.getPublicJobs({ sector, limit: 8 }).catch(() => ({ items: [] as JobSummary[] }));
    const articlesPromise = articleService
      .listPublished({ sector, limit: 4 })
      .catch(() => [] as PublicArticleCard[]);
    void Promise.all([jobsPromise, articlesPromise]).then(([jobsRes, articlesRes]) => {
      if (!alive) return;
      setJobs((jobsRes as { items: JobSummary[] }).items ?? []);
      setArticles(articlesRes);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [sector, contentOnly]);

  return { jobs, articles, loading };
}

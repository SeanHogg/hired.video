import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getAsyncInterviewResponses,
  getAsyncInterviews,
  type AsyncInterview,
} from "@/lib/services/studio-features-service";
import type { InterviewResponses } from "./helpers";

/** Recruiter interview list + the one expanded interview's responses. */
export function useInterviewList() {
  const { t } = useTranslation();
  const [interviews, setInterviews] = useState<AsyncInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<InterviewResponses | null>(null);
  const [loadingResponses, setLoadingResponses] = useState(false);

  const fetchInterviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAsyncInterviews();
      setInterviews(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("studio.asyncInterview.errors.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInterviews();
  }, [fetchInterviews]);

  const viewResponses = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setResponses(null);
      return;
    }
    setSelectedId(id);
    setLoadingResponses(true);
    try {
      const data = await getAsyncInterviewResponses(id);
      setResponses(data);
    } catch {
      setResponses(null);
    } finally {
      setLoadingResponses(false);
    }
  };

  return {
    interviews,
    loading,
    error,
    selectedId,
    responses,
    loadingResponses,
    fetchInterviews,
    viewResponses,
  };
}

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  generateInterviewQuestions,
  type GenerateRequest,
  type GenerateResponse,
} from "@/lib/services/interview-assignments-service";

/**
 * Shared driver for /api/interview-assignments/generate.
 *
 * Owns the loading + error + toast lifecycle around the generate call so
 * every surface that produces skill-tailored questions (the Interview
 * Questions tool, the Interview Templates editor, …) behaves identically:
 * one in-flight flag, one error string, an error toast on failure, and a
 * null return the caller can early-return on.
 *
 * Source resolution + result consumption stay with the caller — they differ
 * per surface (a 4-tab source picker vs. a template's role + style fields).
 */
export function useInterviewQuestionGenerator() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(
    async (req: GenerateRequest): Promise<GenerateResponse | null> => {
      setGenerating(true);
      setError(null);
      try {
        return await generateInterviewQuestions(req);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not generate questions";
        setError(message);
        toast.error(message);
        return null;
      } finally {
        setGenerating(false);
      }
    },
    [],
  );

  return { generating, error, setError, generate };
}

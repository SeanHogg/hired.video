import { apiClient } from "../api-client";
import { streamAiJson } from "./ai-stream";
import { aiToolPath } from "@shared/ai-tools/tool-ids";
import {
  ValuePropositionRequestSchema,
  ValuePropositionResponseSchema,
  type ValuePropositionRequest,
  type ValuePropositionResponse,
} from "@shared/tool-schemas";

// Request + response schemas live in shared/tool-schemas.ts so the backend
// and frontend share one source of truth (roadmap #147).
export { ValuePropositionRequestSchema, ValuePropositionResponseSchema };
export type { ValuePropositionRequest, ValuePropositionResponse };

export class ValuePropositionService {
  /** Generate a tailored value proposition. The job is a tracked `jobId` or
   *  pasted `jobContent`; the résumé is a `resumeId` or pasted
   *  `resumeContent`; company fields are optional context. */
  async generate(request: ValuePropositionRequest): Promise<ValuePropositionResponse> {
    const response = await apiClient.post<ValuePropositionResponse>(
      aiToolPath("value-proposition"),
      request,
      ValuePropositionResponseSchema,
    );
    return response.data;
  }

  /** Same request, streamed (#1342): `onText` gets the pitch as it is
   *  written; resolves with the validated result. */
  async generateStreaming(
    request: ValuePropositionRequest,
    onText: (text: string) => void,
  ): Promise<ValuePropositionResponse> {
    return streamAiJson(aiToolPath("value-proposition"), request, {
      schema: ValuePropositionResponseSchema,
      onText,
    });
  }
}

export const valuePropositionService = new ValuePropositionService();
export default valuePropositionService;

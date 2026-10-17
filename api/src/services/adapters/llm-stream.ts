/**
 * The streaming half of the LLM port (#1342). `LLMCallOpts.stream` turns any
 * `callJson` / `callJsonLenient` / `callText` call into a streamed one: the
 * dispatch loop in llm/dispatch.ts runs each profile attempt through
 * `streamCompletion` instead of the one-shot create, so the fallback chain,
 * the `isChainTerminal` short-circuit, the content guard, validation and
 * the ledger charge are the SAME code for both paths.
 *
 * Workers Free (10 ms CPU): this is pass-through. Each gateway chunk is read
 * by the SDK, its text handed straight to the sink, and appended to one
 * string; nothing is parsed or validated per token. The one JSON parse +
 * schema check runs once, on the finished answer, exactly as for a
 * non-streamed call.
 *
 * No imports from llm-client.ts or llm/ at runtime (llm/dispatch.ts imports this module).
 */
import type {
  BuilderforceClient,
  ChatCompletionCreateParams,
  ChatCompletionResponse,
  ChatMessage,
} from "@seanhogg/builderforce-sdk";

/** Where a streamed answer goes as it is generated. */
export interface LLMStreamSink {
  /** A piece of the answer, in order. */
  onDelta(text: string): void;
  /** The attempt that produced the deltas so far failed and the next
   *  profile is starting over: whatever was shown is to be discarded. */
  onReset?(): void;
}

/** Rough tokens for `chars` characters — used only when the gateway's
 *  stream carries no usage block, so a streamed call is never left
 *  uncharged (paid AI is always recorded in ai_usage_records). */
export function estimateTokens(chars: number): number {
  return chars > 0 ? Math.ceil(chars / 4) : 0;
}

function promptChars(messages: readonly ChatMessage[]): number {
  let n = 0;
  for (const m of messages) n += typeof m.content === "string" ? m.content.length : 0;
  return n;
}

/**
 * One streamed attempt, folded back into the one-shot response shape the
 * dispatch loop already reads (content, finish_reason, usage, model). Throws
 * like the one-shot call does, so the loop's error handling is unchanged.
 * `streamed()` tells the loop whether anything reached the sink (so it knows
 * to send a reset before the next profile).
 */
export async function streamCompletion<P extends ChatCompletionCreateParams & { messages: ChatMessage[] }>(
  sdk: BuilderforceClient,
  /** The one-shot params (any `stream` flag is overridden). Generic so the
   *  caller's concrete shape survives the spread: the SDK type has an index
   *  signature, and spreading a value typed as it loses `messages`. */
  params: P,
  sink: LLMStreamSink,
  onFirstDelta: () => void,
): Promise<ChatCompletionResponse> {
  const stream = await sdk.chat.completions.create({
    ...params,
    stream: true,
    // OpenAI-compatible: ask for the usage block on the final chunk.
    stream_options: { include_usage: true },
  });
  let content = "";
  let finishReason: string | null = null;
  let model: string | undefined;
  let usage: ChatCompletionResponse["usage"];
  for await (const chunk of stream) {
    if (chunk.model) model = chunk.model;
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const text = choice?.delta?.content;
    if (typeof text === "string" && text.length > 0) {
      if (content.length === 0) onFirstDelta();
      content += text;
      sink.onDelta(text);
    }
  }
  if (!usage || !usage.total_tokens) {
    const prompt = estimateTokens(promptChars(params.messages));
    const completion = estimateTokens(content.length);
    usage = { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
  }
  return {
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason ?? "stop" }],
    usage,
  };
}

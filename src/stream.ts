import {
  type Api,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  createAssistantMessageEventStream,
  type Model,
  type SimpleStreamOptions,
  openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";
import { clearMintCache, resolveModelApiKey } from "./auth/mint.js";

function errorAssistant(model: Model<Api>, message: string) {
  return {
    role: "assistant" as const,
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "error" as const,
    errorMessage: message,
    timestamp: Date.now(),
  };
}

function isInvalidApiKeyError(message: string | undefined): boolean {
  return Boolean(message && /invalid_api_key|unauthorized|authentication_error/i.test(message));
}

async function collectUntilCommitted(
  inner: AssistantMessageEventStream,
): Promise<{ events: AssistantMessageEvent[]; retryAuth: boolean }> {
  const events: AssistantMessageEvent[] = [];
  for await (const event of inner) {
    events.push(event);
    if (event.type === "error") {
      return { events, retryAuth: isInvalidApiKeyError(event.error.errorMessage) };
    }
    if (event.type !== "start") {
      return { events, retryAuth: false };
    }
  }
  return { events, retryAuth: false };
}

function pipeCachedAndRest(
  sink: AssistantMessageEventStream,
  events: AssistantMessageEvent[],
): void {
  for (const event of events) sink.push(event);
}

export function streamMuse(
  model: Model<Api>,
  context: Context,
  options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  (async () => {
    try {
      const token = options?.apiKey;
      if (!token) throw new Error("No Muse credentials. Run /login muse.");
      const signal = options?.signal ?? new AbortController().signal;

      const run = (apiKey: string, baseUrl: string) =>
        openAIResponsesApi().streamSimple(
          { ...model, api: "openai-responses", baseUrl } as Model<"openai-responses">,
          context,
          { ...options, apiKey },
        );

      let minted = await resolveModelApiKey(token, signal);
      let inner = await Promise.resolve(run(minted.apiKey, minted.baseUrl));
      let { events, retryAuth } = await collectUntilCommitted(inner);

      if (retryAuth) {
        clearMintCache();
        minted = await resolveModelApiKey(token, signal, { force: true });
        inner = await Promise.resolve(run(minted.apiKey, minted.baseUrl));
        ({ events, retryAuth } = await collectUntilCommitted(inner));
      }

      pipeCachedAndRest(stream, events);
      if (!events.some((event) => event.type === "error" || event.type === "done")) {
        for await (const event of inner) stream.push(event);
      }
      stream.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stream.push({
        type: "error",
        reason: "error",
        error: errorAssistant(model, message),
      });
      stream.end();
    }
  })();
  return stream;
}

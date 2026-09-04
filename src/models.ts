import type { Model } from "@earendil-works/pi-ai";
import { BASE_URL, PROVIDER_ID, REQUEST_USER_AGENT } from "./constants.js";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

const THINKING_LEVEL_MAP = {
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "xhigh",
} as const;

const COMPAT = {
  supportsDeveloperRole: true,
} as const;

function museModel(
  id: string,
  name: string,
): Model<"openai-responses"> {
  return {
    id,
    name,
    api: "openai-responses",
    provider: PROVIDER_ID,
    baseUrl: BASE_URL,
    reasoning: true,
    input: ["text", "image"],
    cost: { ...ZERO_COST },
    contextWindow: 1_007_997,
    maxTokens: 128_000,
    thinkingLevelMap: { ...THINKING_LEVEL_MAP },
    compat: { ...COMPAT },
    headers: { "User-Agent": REQUEST_USER_AGENT },
  };
}

export const MUSE_MODELS: readonly Model<"openai-responses">[] = [
  museModel("muse-spark-1.3", "Muse Spark 1.3"),
  museModel(
    "muse-spark-1.3-contributor",
    "Muse Spark 1.3 Contributor (may be used for product improvement)",
  ),
  museModel("muse-spark-1.2", "Muse Spark 1.2"),
  museModel(
    "muse-spark-1.2-contributor",
    "Muse Spark 1.2 Contributor (may be used for product improvement)",
  ),
];

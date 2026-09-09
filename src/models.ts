import type { Model } from "@earendil-works/pi-ai";
import { BASE_URL, PROVIDER_ID, REQUEST_USER_AGENT } from "./constants.js";

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

// Muse 只接受 [minimal, low, medium, high, xhigh, max]；`off` 会被 Pi 映射成
// reasoning_effort:"none" 而服务端 400。用 null 把 off 标为不支持，Pi 会向最近的
// 支持档位（minimal）收敛，而不是发出非法请求。
export const THINKING_LEVEL_MAP = {
  off: null,
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

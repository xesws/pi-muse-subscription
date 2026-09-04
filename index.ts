import type { OAuthCredentials, OAuthLoginCallbacks, ProviderAuthInteraction } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { museOAuth } from "./src/auth/oauth.js";
import { inspectMuseCliAuth } from "./src/auth/import-muse-cli.js";
import { getLastMintStatus } from "./src/auth/mint.js";
import { BASE_URL, PACKAGE_VERSION, PROVIDER_ID, PROVIDER_NAME, REQUEST_USER_AGENT } from "./src/constants.js";
import { MUSE_MODELS } from "./src/models.js";
import { streamMuse } from "./src/stream.js";

const OVERFLOW_PATTERN =
  /context[_ ]length|too many tokens|maximum context|prompt is too long|context window/i;

function mintLine(status: ReturnType<typeof getLastMintStatus>): string {
  if (!status) return "  subscription mint: (will run on first request)";
  const tier = status.subsTierName ? ` (${status.subsTierName})` : "";
  return `  subscription mint: active${tier}`;
}

async function loginWithCallbacks(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
  const controller = new AbortController();
  const interaction: ProviderAuthInteraction = {
    signal: controller.signal,
    async prompt(prompt) {
      return callbacks.onPrompt({ message: prompt.message });
    },
    notify(event) {
      if (event.type === "device_code") {
        callbacks.onDeviceCode({
          userCode: event.userCode,
          verificationUri: event.verificationUri,
          intervalSeconds: event.intervalSeconds,
          expiresInSeconds: event.expiresInSeconds,
        });
        return;
      }
      if (event.type === "auth_url") {
        callbacks.onAuth({ url: event.url });
        return;
      }
      if (event.type === "info" || event.type === "progress") {
        callbacks.onProgress?.(event.message);
      }
    },
  };
  const credential = await museOAuth.login(interaction);
  return {
    access: credential.access,
    refresh: credential.refresh,
    expires: credential.expires,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider(PROVIDER_ID, {
    name: PROVIDER_NAME,
    baseUrl: BASE_URL,
    api: "openai-responses",
    headers: { "User-Agent": REQUEST_USER_AGENT },
    streamSimple: streamMuse,
    models: MUSE_MODELS.map(
      ({ id, name, reasoning, thinkingLevelMap, input, cost, contextWindow, maxTokens, compat }) => ({
        id,
        name,
        reasoning,
        thinkingLevelMap,
        input,
        cost,
        contextWindow,
        maxTokens,
        compat,
      }),
    ),
    oauth: {
      name: museOAuth.name,
      isSubscription: true,
      login: loginWithCallbacks,
      refreshToken: (credentials, signal) =>
        museOAuth.refresh({ type: "oauth", ...credentials }, signal),
      getApiKey: (credentials) => credentials.access,
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const auth = ctx.modelRegistry.getProviderAuthStatus(PROVIDER_ID);
    if (auth.configured) return;

    const cli = inspectMuseCliAuth();
    if (cli.hasTokens) {
      ctx.ui.notify(
        "Muse CLI has importable OAuth tokens. Run /login muse to copy them into pi (no browser needed).",
        "info",
      );
      return;
    }
    if (cli.keychainOnly) {
      ctx.ui.notify(
        "Muse CLI is signed in, but tokens are in the OS keychain (not copied). Run /login muse to use the coding-plan subscription in pi.",
        "info",
      );
      return;
    }
    ctx.ui.notify(
      "Muse Code is not authenticated. Run /login muse (or sign in with the Muse CLI first).",
      "warning",
    );
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (message.role !== "assistant") return;
    if (message.stopReason !== "error") return;
    if (message.provider !== PROVIDER_ID && ctx.model?.provider !== PROVIDER_ID) return;
    const errorMessage = message.errorMessage ?? "";
    if (errorMessage.includes("context_length_exceeded")) return;
    if (!OVERFLOW_PATTERN.test(errorMessage)) return;
    return {
      message: {
        ...message,
        errorMessage: `context_length_exceeded: ${errorMessage}`,
      },
    };
  });

  pi.registerCommand("muse", {
    description: "Muse Code subscription status and help",
    handler: async (args, ctx) => {
      const sub = (args || "").trim().split(/\s+/)[0] || "status";
      if (sub === "help") {
        ctx.ui.notify(
          [
            `${PROVIDER_NAME} — Pi subscription provider v${PACKAGE_VERSION}`,
            "",
            "Commands:",
            "  /muse status  — auth source, models, Muse CLI import hint",
            "  /muse help    — this help",
            "  /login muse   — device-code login (imports CLI tokens when present in auth.json)",
            "  /model        — select muse/muse-spark-1.3",
            "",
            "This is the coding-plan subscription path, not PAYG.",
            "Do not use MODEL_API_KEY / LLM| keys here (those are meta-ai / pi-muse-spark).",
          ].join("\n"),
          "info",
        );
        return;
      }

      if (sub !== "status") {
        ctx.ui.notify(`Unknown subcommand "${sub}". Try /muse status or /muse help`, "warning");
        return;
      }

      const auth = ctx.modelRegistry.getProviderAuthStatus(PROVIDER_ID);
      const cli = inspectMuseCliAuth();
      const registered = !!ctx.modelRegistry.getProvider(PROVIDER_ID);
      const models = MUSE_MODELS.map((model) => {
        const found = ctx.modelRegistry.find(PROVIDER_ID, model.id);
        return `  ${model.id} ${found ? "✓" : "✗"}`;
      });
      const active =
        ctx.model?.provider === PROVIDER_ID
          ? `yes (${ctx.model.id})`
          : `no — /model ${PROVIDER_ID}/muse-spark-1.3`;

      const lines = [
        `${PROVIDER_NAME} — Status`,
        "────────────────────────────────────────",
        `Provider: ${PROVIDER_ID} (${PROVIDER_NAME})`,
        `Base URL: ${BASE_URL}`,
        `Package: v${PACKAGE_VERSION}`,
        "",
        "Models:",
        ...models,
        "",
        "Auth:",
        `  pi configured: ${auth.configured ? "yes" : "no"}`,
        `  pi source: ${auth.source ?? "(none)"} ${auth.label ? `(${auth.label})` : ""}`,
        `  Muse CLI file: ${cli.exists ? cli.path : "(missing)"}`,
        `  Muse CLI tokens in file: ${cli.hasTokens ? "yes (run /login muse to import)" : "no"}`,
        `  Muse CLI keychain-only: ${cli.keychainOnly ? "yes" : "no"}`,
        cli.email ? `  Muse CLI account: ${cli.email}` : "",
        mintLine(getLastMintStatus()),
        "",
        "State:",
        `  Provider registered: ${registered ? "yes" : "no"}`,
        `  Active model: ${active}`,
        "",
        "Next:",
        auth.configured
          ? `  /model ${PROVIDER_ID}/muse-spark-1.3`
          : "  /login muse  — then /model muse/muse-spark-1.3",
      ].filter((line) => line !== "");

      ctx.ui.notify(lines.join("\n"), auth.configured ? "info" : "warning");
    },
  });
}

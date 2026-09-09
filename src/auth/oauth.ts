import type {
  OAuthAuth,
  OAuthCredential,
  ProviderAuthInteraction,
} from "@earendil-works/pi-ai";
import {
  AUTH_ORIGIN,
  AUTH_USER_AGENT,
  CLIENT_ID,
  DEFAULT_TOKEN_LIFETIME_SECONDS,
  DEVICE_AUTHORIZATION_PATH,
  DEVICE_CODE_GRANT,
  DEVICE_TOKEN_PATH,
  LONG_LIVED_TTL_MS,
  OIDC_TOKEN_PATH,
  PROVIDER_NAME,
  REFRESH_SKEW_MS,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
import { importedMuseCliCredential } from "./import-muse-cli.js";

const CANCEL_MESSAGE = "Login cancelled";

interface JsonObject {
  [key: string]: unknown;
}

interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(body: JsonObject, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Muse OAuth response field: ${field}`);
  }
  return value;
}

function positiveNumber(body: JsonObject, field: string, fallback?: number): number {
  const value = body[field];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)) && Number(value) > 0) {
    return Number(value);
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Invalid Muse OAuth response field: ${field}`);
}

function trustedHttpsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Untrusted verification URI in Muse OAuth response");
  }
  if (url.protocol !== "https:") {
    throw new Error("Untrusted verification URI in Muse OAuth response");
  }
  return url.href;
}

function requestSignal(signal: AbortSignal): AbortSignal {
  return AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal]);
}

async function postForm(
  url: string,
  fields: Record<string, string>,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; body: JsonObject }> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": AUTH_USER_AGENT,
      },
      body: new URLSearchParams(fields),
      signal: requestSignal(signal),
      redirect: "error",
    });
  } catch (error) {
    if (signal.aborted) throw new Error(CANCEL_MESSAGE);
    throw error;
  }

  let body: JsonObject = {};
  try {
    const parsed: unknown = await response.json();
    if (isRecord(parsed)) body = parsed;
  } catch {
    if (signal.aborted) throw new Error(CANCEL_MESSAGE);
  }

  return { ok: response.ok, status: response.status, body };
}

export function credentialsFromTokenResponse(
  body: JsonObject,
  previousRefreshToken?: string,
): OAuthCredential {
  const access = requiredString(body, "access_token");
  const refresh =
    typeof body.refresh_token === "string" && body.refresh_token.length > 0
      ? body.refresh_token
      : previousRefreshToken ?? "";
  const expiresInSeconds = positiveNumber(body, "expires_in", DEFAULT_TOKEN_LIFETIME_SECONDS);
  // 有 refresh token 才用短有效期 + 提前 5 分钟刷新（常规 OAuth）。
  // Muse 设备码流程不签发 refresh token，此时若照抄 expires_in，本地会在
  // 约 50 分钟后判过期并触发一次注定失败的 refresh（见 LONG_LIVED_TTL_MS 注释）。
  const expires = refresh
    ? Date.now() + expiresInSeconds * 1000 - REFRESH_SKEW_MS
    : Date.now() + LONG_LIVED_TTL_MS;
  return { type: "oauth", access, refresh, expires };
}

function parseDeviceCode(body: JsonObject): DeviceCode {
  const interval = body.interval;
  const intervalSeconds =
    typeof interval === "number" && Number.isFinite(interval) && interval > 0 ? interval : 5;
  const verificationUriComplete =
    typeof body.verification_uri_complete === "string" && body.verification_uri_complete.length > 0
      ? trustedHttpsUrl(body.verification_uri_complete)
      : undefined;
  return {
    deviceCode: requiredString(body, "device_code"),
    userCode: requiredString(body, "user_code"),
    verificationUri: trustedHttpsUrl(requiredString(body, "verification_uri")),
    verificationUriComplete,
    intervalSeconds,
    expiresInSeconds: positiveNumber(body, "expires_in", 900),
  };
}

async function requestDeviceCode(signal: AbortSignal): Promise<DeviceCode> {
  const response = await postForm(
    `${AUTH_ORIGIN}${DEVICE_AUTHORIZATION_PATH}`,
    { client_id: CLIENT_ID },
    signal,
  );
  if (!response.ok) {
    const detail =
      typeof response.body.error === "string"
        ? `: ${response.body.error}`
        : "";
    throw new Error(`Muse device authorization failed (HTTP ${response.status})${detail}`);
  }
  return parseDeviceCode(response.body);
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error(CANCEL_MESSAGE));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(CANCEL_MESSAGE));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function pollForTokens(device: DeviceCode, signal: AbortSignal): Promise<OAuthCredential> {
  const deadline = Date.now() + device.expiresInSeconds * 1000;
  let intervalMs = Math.max(1000, device.intervalSeconds * 1000);
  await sleep(intervalMs, signal);

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error(CANCEL_MESSAGE);
    const response = await postForm(
      `${AUTH_ORIGIN}${DEVICE_TOKEN_PATH}`,
      {
        grant_type: DEVICE_CODE_GRANT,
        device_code: device.deviceCode,
        client_id: CLIENT_ID,
      },
      signal,
    );
    if (response.ok) {
      return credentialsFromTokenResponse(response.body);
    }
    const error = response.body.error;
    if (error === "authorization_pending") {
      await sleep(intervalMs, signal);
      continue;
    }
    if (error === "slow_down") {
      const next = response.body.interval;
      if (typeof next === "number" && next > 0) intervalMs = Math.max(1000, next * 1000);
      else intervalMs += 5000;
      await sleep(intervalMs, signal);
      continue;
    }
    if (error === "access_denied" || error === "authorization_denied") {
      throw new Error("Muse device authorization was denied");
    }
    if (error === "expired_token") {
      throw new Error("Muse device code expired. Run /login muse again.");
    }
    const description =
      typeof response.body.error_description === "string"
        ? `: ${response.body.error_description}`
        : typeof error === "string"
          ? `: ${error}`
          : "";
    throw new Error(`Muse device token polling failed (HTTP ${response.status})${description}`);
  }
  throw new Error("Muse device flow timed out");
}

async function loginMuse(interaction: ProviderAuthInteraction): Promise<OAuthCredential> {
  const imported = importedMuseCliCredential();
  if (imported) {
    interaction.notify({
      type: "info",
      message: "Imported Muse CLI login from ~/.config/muse/auth.json",
    });
    return imported;
  }

  const device = await requestDeviceCode(interaction.signal);
  const verificationUri = device.verificationUriComplete ?? device.verificationUri;
  interaction.notify({
    type: "device_code",
    userCode: device.userCode,
    verificationUri,
    intervalSeconds: device.intervalSeconds,
    expiresInSeconds: device.expiresInSeconds,
  });
  interaction.notify({
    type: "auth_url",
    url: verificationUri,
    instructions: "Approve Muse Code in the browser, then return here.",
  });
  const token = await pollForTokens(device, interaction.signal);
  return { ...token, source: "device_code" };
}

const REFRESH_ENDPOINTS = [
  `${AUTH_ORIGIN}${DEVICE_TOKEN_PATH}`,
  `${AUTH_ORIGIN}${OIDC_TOKEN_PATH}`,
  `${AUTH_ORIGIN}/oidc/token`,
];

async function refreshMuseToken(
  credential: OAuthCredential,
  signal: AbortSignal,
): Promise<OAuthCredential> {
  // Muse 的设备码流程不发 refresh token（Meta 拒绝一切 scope），所以刷新请求永远不可能成功。
  // 旧实现直接抛错 → Pi 报 "OAuth refresh failed for muse" 并要求重新登录；
  // 现在改为沿用同一个 access token 并续上长期有效期，让服务端 401 决定是否真的失效。
  if (!credential.refresh) {
    return { ...credential, expires: Date.now() + LONG_LIVED_TTL_MS };
  }

  let lastError: Error | undefined;
  for (const url of REFRESH_ENDPOINTS) {
    const response = await postForm(
      url,
      {
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: credential.refresh,
      },
      signal,
    );
    if (response.ok) {
      return {
        ...credentialsFromTokenResponse(response.body, credential.refresh),
        source: credential.source,
      };
    }
    const description =
      typeof response.body.error_description === "string"
        ? `: ${response.body.error_description}`
        : typeof response.body.error === "string"
          ? `: ${response.body.error}`
          : "";
    lastError = new Error(`Muse token refresh failed (HTTP ${response.status})${description}`);
    if (response.status === 401 || response.status === 403 || response.body.error === "invalid_grant") {
      throw lastError;
    }
  }
  throw lastError ?? new Error("Muse token refresh failed");
}

export const museOAuth: OAuthAuth = {
  name: `${PROVIDER_NAME} (subscription)`,
  isSubscription: true,
  loginLabel: "Sign in with Muse Code",
  login: loginMuse,
  refresh: refreshMuseToken,
  async toAuth(credential) {
    return { apiKey: credential.access };
  },
};

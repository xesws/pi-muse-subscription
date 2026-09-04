import {
  BASE_URL,
  MINTED_KEY_PREFIX,
  MINT_API_VERSION,
  MINT_ORIGIN,
  MINT_PATH,
  MINT_TTL_MS,
  MINT_USER_AGENT,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";

export interface MintedModelKey {
  apiKey: string;
  baseUrl: string;
  isSubsActive: boolean;
  requirePayment: boolean;
  subsTierName?: string;
  userEmail?: string;
  fetchedAt: number;
}

interface MintCache {
  oauthAccess: string;
  minted: MintedModelKey;
}

let cache: MintCache | undefined;
let lastStatus: Omit<MintedModelKey, "apiKey"> | undefined;

export function isMintedModelKey(value: string): boolean {
  return value.startsWith(MINTED_KEY_PREFIX);
}

export function getLastMintStatus(): Omit<MintedModelKey, "apiKey"> | undefined {
  return lastStatus;
}

export function clearMintCache(): void {
  cache = undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trustedHttpsUrl(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return fallback;
    return url.href.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export function parseMintResponse(payload: unknown, fetchedAt = Date.now()): MintedModelKey {
  if (!isRecord(payload)) {
    throw new Error("Muse key mint returned a non-object response");
  }
  const apiKey = payload.api_key;
  if (typeof apiKey !== "string" || !apiKey.startsWith(MINTED_KEY_PREFIX)) {
    throw new Error("Muse key mint did not return a Model API key");
  }
  const requirePayment = payload.require_payment === true;
  const isSubsActive = payload.is_subs_active !== false;
  if (requirePayment) {
    throw new Error(
      "Muse Code requires an active coding-plan subscription. Subscribe at https://accountscenter.meta.com/muse_code then /login muse again.",
    );
  }
  if (!isSubsActive) {
    throw new Error(
      "Muse Code subscription is not active on this account. Run /login muse with the subscribed Meta account.",
    );
  }
  const minted: MintedModelKey = {
    apiKey,
    baseUrl: trustedHttpsUrl(payload.base_url, BASE_URL),
    isSubsActive,
    requirePayment,
    subsTierName: typeof payload.subs_tier_name === "string" ? payload.subs_tier_name : undefined,
    userEmail: typeof payload.user_email === "string" ? payload.user_email : undefined,
    fetchedAt,
  };
  lastStatus = {
    baseUrl: minted.baseUrl,
    isSubsActive: minted.isSubsActive,
    requirePayment: minted.requirePayment,
    subsTierName: minted.subsTierName,
    userEmail: minted.userEmail,
    fetchedAt: minted.fetchedAt,
  };
  return minted;
}

async function mintFromOAuth(oauthAccess: string, signal: AbortSignal): Promise<MintedModelKey> {
  const response = await fetch(`${MINT_ORIGIN}${MINT_PATH}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${oauthAccess}`,
      "User-Agent": MINT_USER_AGENT,
      "x-api-version": MINT_API_VERSION,
    },
    body: "{}",
    signal: AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal]),
    redirect: "error",
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Muse key mint returned invalid JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const detail =
      isRecord(payload) && typeof payload.detail === "string"
        ? `: ${payload.detail}`
        : isRecord(payload) && typeof payload.title === "string"
          ? `: ${payload.title}`
          : "";
    throw new Error(`Muse key mint failed (HTTP ${response.status})${detail}`);
  }
  return parseMintResponse(payload);
}

export async function resolveModelApiKey(
  token: string,
  signal: AbortSignal,
  options?: { force?: boolean },
): Promise<MintedModelKey> {
  if (!token) {
    throw new Error("No Muse credentials. Run /login muse.");
  }
  if (isMintedModelKey(token)) {
    const minted: MintedModelKey = {
      apiKey: token,
      baseUrl: BASE_URL,
      isSubsActive: true,
      requirePayment: false,
      fetchedAt: Date.now(),
    };
    lastStatus = {
      baseUrl: minted.baseUrl,
      isSubsActive: true,
      requirePayment: false,
      fetchedAt: minted.fetchedAt,
    };
    return minted;
  }
  const fresh =
    !options?.force &&
    cache &&
    cache.oauthAccess === token &&
    Date.now() - cache.minted.fetchedAt < MINT_TTL_MS;
  if (fresh && cache) return cache.minted;
  const minted = await mintFromOAuth(token, signal);
  cache = { oauthAccess: token, minted };
  return minted;
}

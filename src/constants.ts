export const PACKAGE_VERSION = "0.1.1";

export const PROVIDER_ID = "muse";
export const PROVIDER_NAME = "Muse Code";
export const BASE_URL = "https://api.meta.ai/v1";
export const MINT_ORIGIN = "https://api.meta.ai";
export const MINT_PATH = "/muse-code/key";
export const MINT_API_VERSION = "1.0.0";
export const MINT_USER_AGENT = "muse-code/1.0.2";
export const MINTED_KEY_PREFIX = "LLM|";
export const MINT_TTL_MS = 45 * 60 * 1000;

export const AUTH_ORIGIN = "https://auth.meta.com";
export const CLIENT_ID = "1031625952748946";
export const DEVICE_AUTHORIZATION_PATH = "/oidc/device/authorization/";
export const DEVICE_TOKEN_PATH = "/oidc/device/token/";
export const OIDC_TOKEN_PATH = "/oidc/token/";
export const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** Official Muse launcher UA — Meta's OIDC endpoints expect this public client. */
export const AUTH_USER_AGENT = "muse-code/launcher-2";
export const REQUEST_USER_AGENT = `pi-muse-subscription/${PACKAGE_VERSION}`;

export const REFRESH_SKEW_MS = 5 * 60 * 1000;
export const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;
export const REQUEST_TIMEOUT_MS = 30_000;

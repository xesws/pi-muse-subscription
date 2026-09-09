export const PACKAGE_VERSION = "0.1.2";

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

/**
 * 无 refresh token 时的凭据有效期（50 天）。
 *
 * Meta 的 Muse 设备码流程**不签发 refresh token**（`scope` 一律被拒：
 * `invalid_scope: Requested scopes are not supported by this endpoint.`），
 * 而 token 响应里的 `expires_in` 远短于 access token 的真实寿命：
 * 实测 2026-09-07 登录、本地 expires 为 2026-09-08 00:14 的 token，
 * 在 2026-09-09 05:06 仍能成功铸造 Model API key（订阅有效）。
 *
 * 因此无 refresh token 的凭据按“长期有效”处理，到期与否交给服务端 401 裁决；
 * 否则 Pi 会在本地 expires 到点后尝试一次注定失败的 refresh，
 * 直接报 `OAuth refresh failed for muse: ...` 并逼用户重新 /login。
 */
export const LONG_LIVED_TTL_MS = 50 * 24 * 60 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 30_000;

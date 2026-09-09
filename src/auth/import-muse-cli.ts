import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthCredential } from "@earendil-works/pi-ai";
import { BASE_URL, LONG_LIVED_TTL_MS, REFRESH_SKEW_MS } from "../constants.js";

export interface MuseCliAuthInspection {
  path: string;
  exists: boolean;
  mechanism?: string;
  storage?: string;
  email?: string;
  apiBaseUrl?: string;
  /** Tokens are in the JSON file (not keychain-only). */
  hasTokens: boolean;
  /** CLI thinks the user is signed in, but secrets live outside the JSON file. */
  keychainOnly: boolean;
  credential?: OAuthCredential;
}

function museAuthPath(): string {
  if (process.env.MUSE_AUTH_PATH) return process.env.MUSE_AUTH_PATH;
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "muse", "auth.json");
  return join(homedir(), ".config", "muse", "auth.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeExpiresAt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  // Seconds vs milliseconds: values below year ~2001 in ms are treated as seconds.
  const ms = value < 1e12 ? value * 1000 : value;
  return ms - REFRESH_SKEW_MS;
}

function trustedHttpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    return url.href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export function parseMuseCliAuthJson(raw: string, path: string): MuseCliAuthInspection {
  const empty: MuseCliAuthInspection = {
    path,
    exists: true,
    hasTokens: false,
    keychainOnly: false,
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;
  const providers = parsed.providers;
  if (!isRecord(providers)) return empty;
  const meta = providers.meta;
  if (!isRecord(meta)) return empty;

  const mechanism = readString(meta, "mechanism");
  const storage = readString(meta, "storage");
  const email = readString(meta, "user_email");
  const apiBaseUrl = trustedHttpsUrl(readString(meta, "api_base_url"));
  const access = readString(meta, "access_token");
  const refresh = readString(meta, "refresh_token") ?? "";
  // 同 oauth.ts：Muse 设备码流程不签发 refresh token，其 expires_at 短于 token 真实寿命，
  // 无 refresh token 时按长期有效处理，避免 Pi 触发注定失败的 refresh。
  const expires = refresh
    ? (normalizeExpiresAt(meta.expires_at) ?? Date.now() + 60 * 60 * 1000 - REFRESH_SKEW_MS)
    : Date.now() + LONG_LIVED_TTL_MS;

  const hasTokens = Boolean(access);
  const keychainOnly = !hasTokens && (storage === "keychain" || mechanism === "oauth");

  const credential: OAuthCredential | undefined = access
    ? {
        type: "oauth",
        access,
        refresh,
        expires,
        source: "imported",
      }
    : undefined;

  return {
    path,
    exists: true,
    mechanism,
    storage,
    email,
    apiBaseUrl: apiBaseUrl ?? BASE_URL,
    hasTokens,
    keychainOnly,
    credential,
  };
}

export function inspectMuseCliAuth(): MuseCliAuthInspection {
  const path = museAuthPath();
  if (!existsSync(path)) {
    return { path, exists: false, hasTokens: false, keychainOnly: false };
  }
  try {
    return parseMuseCliAuthJson(readFileSync(path, "utf8"), path);
  } catch {
    return { path, exists: true, hasTokens: false, keychainOnly: false };
  }
}

export function importedMuseCliCredential(): OAuthCredential | undefined {
  return inspectMuseCliAuth().credential;
}

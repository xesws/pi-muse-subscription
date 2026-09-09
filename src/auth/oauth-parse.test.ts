import assert from "node:assert/strict";
import test from "node:test";
import { credentialsFromTokenResponse, museOAuth } from "./oauth.ts";
import { LONG_LIVED_TTL_MS } from "../constants.ts";

test("parses token response and keeps previous refresh token", () => {
  const cred = credentialsFromTokenResponse(
    { access_token: "a", expires_in: 3600 },
    "old-refresh",
  );
  assert.equal(cred.type, "oauth");
  assert.equal(cred.access, "a");
  assert.equal(cred.refresh, "old-refresh");
  assert.ok(cred.expires > Date.now());
});

test("rotates refresh token when present", () => {
  const cred = credentialsFromTokenResponse({
    access_token: "a",
    refresh_token: "new-refresh",
    expires_in: "7200",
  });
  assert.equal(cred.refresh, "new-refresh");
});

test("refresh token present keeps short expiry with skew", () => {
  const cred = credentialsFromTokenResponse({
    access_token: "a",
    refresh_token: "r",
    expires_in: 600,
  });
  const delta = cred.expires - Date.now();
  assert.ok(delta > 4 * 60 * 1000 && delta < 6 * 60 * 1000, `unexpected delta ${delta}`);
});

test("no refresh token treats the credential as long-lived", () => {
  // Meta 的 Muse 设备码流程不发 refresh token；expires_in 远短于 token 真实寿命。
  const cred = credentialsFromTokenResponse({ access_token: "a", expires_in: 600 });
  assert.equal(cred.refresh, "");
  assert.ok(
    cred.expires - Date.now() > 30 * 24 * 60 * 60 * 1000,
    "refresh-less credentials must not expire on the short OIDC expires_in",
  );
});

test("refresh without a refresh token keeps the access token instead of failing", async () => {
  const stale = { type: "oauth" as const, access: "a", refresh: "", expires: Date.now() - 1000 };
  const renewed = await museOAuth.refresh(stale, new AbortController().signal);
  assert.equal(renewed.access, "a");
  assert.equal(renewed.refresh, "");
  assert.ok(renewed.expires - Date.now() > LONG_LIVED_TTL_MS - 5000);
});

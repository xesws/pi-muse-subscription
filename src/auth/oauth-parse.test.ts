import assert from "node:assert/strict";
import test from "node:test";
import { credentialsFromTokenResponse } from "./oauth.ts";

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

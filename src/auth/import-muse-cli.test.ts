import assert from "node:assert/strict";
import test from "node:test";
import { parseMuseCliAuthJson } from "./import-muse-cli.ts";

test("parses oauth tokens from Muse CLI auth.json", () => {
  const raw = JSON.stringify({
    schema_version: 1,
    providers: {
      meta: {
        mechanism: "oauth",
        storage: "file",
        access_token: "tok_access",
        refresh_token: "tok_refresh",
        expires_at: 2000000000,
        api_base_url: "https://api.meta.ai/v1",
        user_email: "user@example.com",
      },
    },
  });
  const inspection = parseMuseCliAuthJson(raw, "/tmp/muse-auth.json");
  assert.equal(inspection.hasTokens, true);
  assert.equal(inspection.keychainOnly, false);
  assert.equal(inspection.email, "user@example.com");
  assert.equal(inspection.credential?.access, "tok_access");
  assert.equal(inspection.credential?.refresh, "tok_refresh");
  assert.equal(inspection.credential?.type, "oauth");
});

test("keychain-only login has no importable tokens", () => {
  const raw = JSON.stringify({
    schema_version: 1,
    providers: {
      meta: {
        mechanism: "oauth",
        storage: "keychain",
        api_base_url: "https://api.meta.ai/v1",
        user_email: "user@example.com",
      },
    },
  });
  const inspection = parseMuseCliAuthJson(raw, "/tmp/muse-auth.json");
  assert.equal(inspection.hasTokens, false);
  assert.equal(inspection.keychainOnly, true);
  assert.equal(inspection.credential, undefined);
  assert.equal(inspection.apiBaseUrl, "https://api.meta.ai/v1");
});

test("rejects non-https api_base_url", () => {
  const raw = JSON.stringify({
    providers: {
      meta: {
        mechanism: "oauth",
        api_base_url: "http://evil.example/v1",
      },
    },
  });
  const inspection = parseMuseCliAuthJson(raw, "/tmp/muse-auth.json");
  assert.equal(inspection.apiBaseUrl, "https://api.meta.ai/v1");
});

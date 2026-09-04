import assert from "node:assert/strict";
import test from "node:test";
import { parseMintResponse } from "./mint.ts";

test("parses a subscription mint response", () => {
  const minted = parseMintResponse({
    api_key: "LLM|abc",
    base_url: "https://api.meta.ai/v1",
    require_payment: false,
    is_subs_active: true,
    subs_tier_name: "Muse Code Power Usage",
    user_email: "user@example.com",
  });
  assert.equal(minted.apiKey, "LLM|abc");
  assert.equal(minted.baseUrl, "https://api.meta.ai/v1");
  assert.equal(minted.subsTierName, "Muse Code Power Usage");
});

test("rejects http base_url", () => {
  const minted = parseMintResponse({
    api_key: "LLM|abc",
    base_url: "http://evil.example/v1",
    is_subs_active: true,
  });
  assert.equal(minted.baseUrl, "https://api.meta.ai/v1");
});

test("rejects inactive subscription", () => {
  assert.throws(
    () =>
      parseMintResponse({
        api_key: "LLM|abc",
        base_url: "https://api.meta.ai/v1",
        is_subs_active: false,
      }),
    /subscription is not active/,
  );
});

test("rejects missing LLM key", () => {
  assert.throws(
    () =>
      parseMintResponse({
        api_key: "not-a-model-key",
        base_url: "https://api.meta.ai/v1",
        is_subs_active: true,
      }),
    /did not return a Model API key/,
  );
});

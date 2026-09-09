import assert from "node:assert/strict";
import test from "node:test";
import { MUSE_MODELS, THINKING_LEVEL_MAP } from "./models.ts";

test("every Muse model hides the unsupported off level", () => {
  // Muse 拒绝 reasoning_effort:"none"（即 Pi 的 off），必须显式标 null 让其收敛到 minimal。
  assert.equal(THINKING_LEVEL_MAP.off, null);
  for (const model of MUSE_MODELS) {
    assert.equal(model.thinkingLevelMap?.off, null, `${model.id} must hide off`);
  }
});

test("Muse thinking levels stay inside the server-supported set", () => {
  const supported = new Set(["minimal", "low", "medium", "high", "xhigh"]);
  for (const [level, mapped] of Object.entries(THINKING_LEVEL_MAP)) {
    if (mapped === null) continue;
    assert.ok(supported.has(mapped), `${level} -> ${mapped} is not a Muse-supported effort`);
  }
});

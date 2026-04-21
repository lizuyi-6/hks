import { describe, expect, it } from "vitest";

// NOTE: vitest runs in a Node environment (no jsdom) — we can't mount the
// React component directly. Instead we smoke-test the pure data exports so
// the provider → field mapping stays in sync with the backend schema in
// apps/api/app/db/repositories/integrations.py.
import { FIELD_META_FOR_TESTS } from "./integrations-form";

const EXPECTED_PROVIDERS = ["bing_search", "tianyancha", "doubao_llm", "smtp"];

describe("integrations-form field metadata", () => {
  it("covers every backend provider key", () => {
    const keys = Object.keys(FIELD_META_FOR_TESTS);
    for (const provider of EXPECTED_PROVIDERS) {
      expect(keys).toContain(provider);
    }
  });

  it("marks every secret field as password input", () => {
    // The primary secret for each provider (backend primary_secret) must
    // render as a password input so the UI never echoes the key.
    const secretFieldByProvider: Record<string, string> = {
      bing_search: "api_key",
      tianyancha: "api_key",
      doubao_llm: "api_key",
      smtp: "password",
    };
    for (const [provider, field] of Object.entries(secretFieldByProvider)) {
      const meta = FIELD_META_FOR_TESTS[provider]?.[field];
      expect(meta, `${provider}.${field} missing meta`).toBeDefined();
      expect(meta!.type).toBe("password");
    }
  });

  it("uses a switch for the SMTP TLS toggle", () => {
    expect(FIELD_META_FOR_TESTS.smtp?.use_tls?.type).toBe("switch");
  });

  it("labels SMTP port as number", () => {
    expect(FIELD_META_FOR_TESTS.smtp?.port?.type).toBe("number");
  });
});

// Tests for the /api/ai/leads provider chain (lib/engine/ai-providers):
// fallback order, skip-when-unconfigured, and no fake output. All
// fetch calls are stubbed — no real provider is ever contacted.
// Run with: node --test tests/ai-providers.test.ts

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  geminiGenerate,
  generateAiLeads,
  groqGenerate,
  openrouterGenerate,
} from "../lib/engine/ai-providers.ts";

type StubEntry = { url: string; body: Record<string, unknown> | null };

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function parseLeads(text: string): { company: string }[] | null {
  try {
    const parsed = JSON.parse(text) as { leads?: unknown };
    if (!Array.isArray(parsed.leads)) return null;
    return parsed.leads as { company: string }[];
  } catch {
    return null;
  }
}

const LEADS_JSON = JSON.stringify({ leads: [{ company: "Acme Corp" }] });

describe("generateAiLeads fallback chain", () => {
  const realFetch = globalThis.fetch;
  let calls: StubEntry[] = [];
  // Per-provider stub behaviour, replaced per test.
  let groq: (body: Record<string, unknown>) => unknown = () => jsonResponse(500, {});
  let gemini: () => unknown = () => jsonResponse(500, {});
  let openrouter: (body: Record<string, unknown>) => unknown = () => jsonResponse(500, {});

  beforeEach(() => {
    calls = [];
    groq = () => jsonResponse(500, {});
    gemini = () => jsonResponse(500, {});
    openrouter = () => jsonResponse(500, {});
    process.env.GROQ_API_KEY = "test-key";
    process.env.GEMINI_API_KEY = "test-key";
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_TEXT_MODEL;
    globalThis.fetch = (async (url: string, init?: { body?: unknown }) => {
      let body: Record<string, unknown> | null = null;
      try {
        body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      calls.push({ url, body });
      if (url.includes("api.groq.com")) return groq(body ?? {});
      if (url.includes("generativelanguage.googleapis.com")) return gemini();
      if (url.includes("openrouter.ai")) return openrouter(body ?? {});
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_TEXT_MODEL;
  });

  it("tries Groq, then Gemini, then OpenRouter, in that order", async () => {
    openrouter = () => jsonResponse(200, { choices: [{ message: { content: LEADS_JSON } }] });
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.ok(result);
    assert.equal(result.provider, "openrouter");
    assert.deepEqual(result.result, [{ company: "Acme Corp" }]);
    assert.deepEqual(
      calls.map((c) => (c.url.includes("api.groq.com") ? "groq" : c.url.includes("generativelanguage") ? "gemini" : "openrouter")),
      ["groq", "gemini", "openrouter"],
    );
  });

  it("short-circuits on the first provider that answers", async () => {
    groq = () => jsonResponse(200, { choices: [{ message: { content: LEADS_JSON } }] });
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.ok(result);
    assert.equal(result.provider, "groq");
    assert.equal(calls.length, 1);
  });

  it("moves on when a provider answers unparseable text", async () => {
    groq = () => jsonResponse(200, { choices: [{ message: { content: "not json at all" } }] });
    gemini = () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: LEADS_JSON }] } }] });
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.ok(result);
    assert.equal(result.provider, "gemini");
  });

  it("returns null and never calls fetch when no key is set", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a provider key");
    }) as unknown as typeof fetch;
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.equal(result, null);
  });

  it("skips OpenRouter when its key is absent", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.equal(result, null);
    assert.equal(calls.some((c) => c.url.includes("openrouter.ai")), false);
    assert.deepEqual(
      calls.map((c) => (c.url.includes("api.groq.com") ? "groq" : "gemini")),
      ["groq", "gemini"],
    );
  });

  it("returns null, never fake output, when every provider fails", async () => {
    const result = await generateAiLeads("prompt", 5000, parseLeads);
    assert.equal(result, null);
    openrouter = () => jsonResponse(200, { choices: [{ message: { content: "" } }] });
    groq = () => jsonResponse(200, { choices: [{ message: { content: "" } }] });
    gemini = () => jsonResponse(200, { candidates: [{ content: { parts: [{ text: "" }] } }] });
    const empty = await generateAiLeads("prompt", 5000, parseLeads);
    assert.equal(empty, null);
  });
});

describe("openrouterGenerate model selection", () => {
  const realFetch = globalThis.fetch;
  let lastBody: Record<string, unknown> | null = null;

  beforeEach(() => {
    lastBody = null;
    process.env.OPENROUTER_API_KEY = "test-key";
    delete process.env.OPENROUTER_TEXT_MODEL;
    globalThis.fetch = (async (_url: string, init?: { body?: unknown }) => {
      try {
        lastBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      } catch {
        lastBody = null;
      }
      return jsonResponse(200, { choices: [{ message: { content: "ok" } }] });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_TEXT_MODEL;
  });

  it("sends the verified default model when no override is set", async () => {
    const text = await openrouterGenerate("hi", 5000);
    assert.equal(text, "ok");
    assert.equal(lastBody?.model, "liquid/lfm-2.5-2.6b:free");
  });

  it("lets OPENROUTER_TEXT_MODEL override the default", async () => {
    process.env.OPENROUTER_TEXT_MODEL = "some/other-model";
    await openrouterGenerate("hi", 5000);
    assert.equal(lastBody?.model, "some/other-model");
  });

  it("returns null without a key and without calling fetch", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.GEMINI_API_KEY;
    globalThis.fetch = (async () => {
      throw new Error("fetch must not be called without a key");
    }) as unknown as typeof fetch;
    assert.equal(await openrouterGenerate("hi", 5000), null);
    assert.equal(await groqGenerate("hi", 5000), null);
    assert.equal(await geminiGenerate("hi", 5000), null);
  });
});

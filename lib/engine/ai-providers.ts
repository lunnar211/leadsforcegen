// AI text providers for the /api/ai/leads generation chain.
//
// Every function returns null when its key is missing, the request
// fails, or the answer is empty — never a fake result. The caller
// tries them in order (Groq -> Gemini -> OpenRouter) and falls
// through to an honest empty result when all three return null.
//
// OpenRouter default model: liquid/lfm-2.5-2.6b:free — verified
// present in the live OpenRouter catalogue (416 models) on
// 2026-11-01. Override with OPENROUTER_TEXT_MODEL. The key itself
// is key-gated like the others: with no OPENROUTER_API_KEY set, the
// chain behaves exactly as it did before OpenRouter existed.

export const OPENROUTER_DEFAULT_MODEL = "liquid/lfm-2.5-2.6b:free";

export async function groqGenerate(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || "openai/gpt-oss-20b";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

// Gemini — second AI source (when Groq is down/missing) and the default
// filter brain. Same honesty rules as Groq: company-level prospects only,
// never invented personal contacts. GEMINI_API_URL override exists so the
// integration can be tested against a local mock.
export async function geminiGenerate(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const url = process.env.GEMINI_API_URL || `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.map((p: { text?: string }) => p.text || "").join("");
  } catch {
    return null;
  }
}

// Ordered generation chain: Groq -> Gemini -> OpenRouter. Each step
// returns null when its key is missing or its answer is unusable, so
// the chain moves to the next provider; when all three fail it
// returns null and the caller answers with an honest empty result.
// `parse` runs per provider, so an unparseable answer from one
// provider still lets the next provider try (same behaviour as the
// old per-provider leads functions this replaces).
export async function generateAiLeads<T>(
  prompt: string,
  timeoutMs: number,
  parse: (text: string) => T | null,
): Promise<{ result: T; provider: string } | null> {
  const chain: { name: string; run: (p: string, t: number) => Promise<string | null> }[] = [
    { name: "groq", run: groqGenerate },
    { name: "gemini", run: geminiGenerate },
    { name: "openrouter", run: openrouterGenerate },
  ];
  for (const step of chain) {
    const text = await step.run(prompt, timeoutMs);
    if (!text) continue;
    const parsed = parse(text);
    if (parsed) return { result: parsed, provider: step.name };
  }
  return null;
}

// OpenRouter — third AI source (when Groq and Gemini are both
// down/missing). OpenAI-compatible chat completions, same JSON-object
// contract as Groq. OPENROUTER_API_URL override exists so the
// integration can be tested against a local mock.
export async function openrouterGenerate(prompt: string, timeoutMs: number): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const model = process.env.OPENROUTER_TEXT_MODEL || OPENROUTER_DEFAULT_MODEL;
  const url = process.env.OPENROUTER_API_URL || "https://openrouter.ai/api/v1/chat/completions";
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://leadsforcegen.vercel.app",
        "X-Title": "LeadsForceGen",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

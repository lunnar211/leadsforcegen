import "server-only";

// AI originality filter for ENGINE results (real businesses only — this
// stage never invents, it only drops). After enrichment, one batched Groq
// call judges each lead against the requested niche + city and returns
// the indices that are CLEARLY mismatched (wrong trade, or an address in
// a different city). Conservative by design: only drop on a confident
// mismatch, and ANY failure (no key, timeout, bad JSON) fails open — the
// unfiltered list is returned untouched. Env-gated on GROQ_API_KEY, the
// same key the outreach feature already uses.

export type ScoredLeadLike = { company: string; address?: string; website?: string };

export async function aiVerifyLeads<T extends ScoredLeadLike>(
  leads: T[],
  niche: string,
  location: string,
): Promise<{ kept: T[]; dropped: number }> {
  const key = process.env.GROQ_API_KEY;
  if (!key || leads.length === 0) return { kept: leads, dropped: 0 };
  const batch = leads.slice(0, 40);
  const lines = batch.map((l, i) => `${i}. ${l.company} | ${l.address || "no address"} | ${l.website || "no website"}`).join("\n");
  const prompt = `You are a strict data-quality filter. The user searched for businesses of type "${niche}" in "${location}". Below are real business listings. Reply with JSON ONLY: {"drop":[indices]} listing ONLY entries you are CONFIDENT are the wrong business type or located in a different city/region than requested. When in doubt, KEEP the entry. Do not drop entries just because an address is incomplete.\n${lines}`;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { kept: leads, dropped: 0 };
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content || "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { drop?: unknown };
    const dropSet = new Set((Array.isArray(parsed.drop) ? parsed.drop : []).filter((n) => typeof n === "number" && n >= 0 && n < batch.length));
    if (dropSet.size === 0) return { kept: leads, dropped: 0 };
    const keptBatch = batch.filter((_, i) => !dropSet.has(i));
    return { kept: [...keptBatch, ...leads.slice(batch.length)], dropped: dropSet.size };
  } catch {
    return { kept: leads, dropped: 0 };
  }
}

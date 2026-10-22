// Rate limiting + counters with two backends:
//  1. Upstash Redis REST API when UPSTASH_REDIS_REST_URL and
//     UPSTASH_REDIS_REST_TOKEN are set (durable, shared across instances).
//  2. In-memory fallback (per instance) so local/demo runs still work.
// Only the REST protocol is used — no SDK, no TCP. If Upstash errors, we
// fall back to memory rather than failing the request open or closed.

const memory = new Map<string, { count: number; resetAt: number }>();

function memGet(key: string): number {
  const rec = memory.get(key);
  if (!rec || rec.resetAt < Date.now()) return 0;
  return rec.count;
}
function memIncr(key: string, windowMs: number): number {
  const now = Date.now();
  const rec = memory.get(key);
  if (!rec || rec.resetAt < now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  rec.count += 1;
  return rec.count;
}
function memReset(key: string): void {
  memory.delete(key);
}

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function upstash(command: (string | number)[]): Promise<unknown> {
  const url = process.env.UPSTASH_REDIS_REST_URL as string;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN as string;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const data = (await res.json()) as { result?: unknown };
  return data.result;
}

/** Current counter value (0 if none / expired). */
export async function counterGet(key: string): Promise<number> {
  if (upstashConfigured()) {
    try {
      const v = await upstash(["GET", key]);
      return Number(v || 0);
    } catch { /* fall through to memory */ }
  }
  return memGet(key);
}

/** Increment and return the new value; sets the window on first increment. */
export async function counterIncr(key: string, windowMs: number): Promise<number> {
  if (upstashConfigured()) {
    try {
      const v = Number(await upstash(["INCR", key]));
      if (v === 1) await upstash(["PEXPIRE", key, windowMs]);
      return v;
    } catch { /* fall through to memory */ }
  }
  return memIncr(key, windowMs);
}

export async function counterReset(key: string): Promise<void> {
  if (upstashConfigured()) {
    try {
      await upstash(["DEL", key]);
      return;
    } catch { /* fall through to memory */ }
  }
  memReset(key);
}

/** Fixed-window rate limit: true = allowed. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = await counterIncr(key, windowMs);
  return count <= limit;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

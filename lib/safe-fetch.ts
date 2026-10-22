// safe-fetch: the ONLY way the lead engine fetches URLs.
// SSRF-safe, robots-aware, per-host rate limited, size capped, timed out.
// Policy blocks (social/login-gated hosts) are enforced here for every call.
import { isBlockedUrl } from "./sources/policy";

const MAX_BYTES = 1_000_000; // 1 MB
const TIMEOUT_MS = 5_000;
const MIN_HOST_GAP_MS = 1_000; // max 1 req/sec/host

export function botUserAgent(): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://leadsforcegen.vercel.app";
  const email = process.env.CONTACT_EMAIL || "admin@example.com";
  return `LeadForgeBot/1.0 (+${site}; ${email})`;
}

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return m ? m.slice(1).map(Number) : null;
}

export function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  const p = ipv4Parts(host);
  if (p) {
    const [a, b] = p;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
  }
  return false;
}

/** Throws on anything unsafe or policy-blocked. Returns the parsed URL. */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`Invalid URL: ${raw}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`Blocked protocol: ${u.protocol}`);
  }
  if (u.username || u.password) throw new Error("URLs with embedded credentials are blocked");
  if (isPrivateOrLocalHost(u.hostname)) throw new Error(`Blocked private/local host: ${u.hostname}`);
  if (isBlockedUrl(raw)) throw new Error(`Blocked by policy (social/login-gated host): ${u.hostname}`);
  return u;
}

// ---- robots.txt ------------------------------------------------------------
const robotsCache = new Map<string, { fetchedAt: number; disallow: string[]; crawlDelay: number }>();
const ROBOTS_TTL = 60 * 60 * 1000;

async function robotsFor(origin: string): Promise<{ disallow: string[]; crawlDelay: number }> {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < ROBOTS_TTL) return cached;
  const entry = { fetchedAt: Date.now(), disallow: [] as string[], crawlDelay: 0 };
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": botUserAgent() },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const text = await res.text();
      let inOurGroup = false;
      for (const line of text.split(/\r?\n/)) {
        const [kRaw, ...rest] = line.split(":");
        const k = kRaw.trim().toLowerCase();
        const v = rest.join(":").trim();
        if (k === "user-agent") inOurGroup = v === "*" || v.toLowerCase().includes("leadforgebot");
        else if (inOurGroup && k === "disallow" && v) entry.disallow.push(v);
        else if (inOurGroup && k === "crawl-delay") entry.crawlDelay = Number(v) || 0;
      }
    }
  } catch {
    // unreachable robots.txt: treat as allowed, robots entry stays empty
  }
  robotsCache.set(origin, entry);
  return entry;
}

export async function isRobotsAllowed(url: string): Promise<boolean> {
  const u = new URL(url);
  const robots = await robotsFor(u.origin);
  return !robots.disallow.some((p) => u.pathname.startsWith(p));
}

// ---- per-host rate limiting ------------------------------------------------
const lastHit = new Map<string, number>();
async function throttle(host: string): Promise<void> {
  const prev = lastHit.get(host) || 0;
  const wait = Math.max(0, prev + MIN_HOST_GAP_MS - Date.now());
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

export type SafeFetchResult = { status: number; text: string; finalUrl: string; contentType: string };

/** Fetch a URL with every guard applied. Redirects are followed manually so
 *  each hop is re-validated (no redirect-into-private-range escapes). */
export async function safeFetch(rawUrl: string, opts: { respectRobots?: boolean } = {}): Promise<SafeFetchResult> {
  let current = rawUrl;
  for (let hop = 0; hop <= 4; hop++) {
    const u = assertSafeUrl(current);
    if (opts.respectRobots !== false && !(await isRobotsAllowed(current))) {
      throw new Error(`Blocked by robots.txt: ${u.hostname}${u.pathname}`);
    }
    await throttle(u.hostname);
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(current, {
          headers: { "User-Agent": botUserAgent(), Accept: "text/html,application/xhtml+xml,text/plain,application/pdf" },
          redirect: "manual",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc) return { status: res.status, text: "", finalUrl: current, contentType: "" };
          current = new URL(loc, current).toString();
          lastErr = null;
          break; // next hop
        }
        const buf = await res.arrayBuffer();
        const trimmed = buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf;
        return {
          status: res.status,
          text: new TextDecoder("utf-8", { fatal: false }).decode(trimmed),
          finalUrl: current,
          contentType: res.headers.get("content-type") || "",
        };
      } catch (e) {
        lastErr = e;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
      }
    }
    if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(`Fetch failed: ${current}`);
  }
  throw new Error(`Too many redirects: ${rawUrl}`);
}

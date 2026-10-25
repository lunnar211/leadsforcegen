import "server-only";
import { NextResponse } from "next/server";
import { clientIp } from "@/lib/rate-limit";
import { serviceClient } from "@/lib/quota";

// Fake/bot IP protection — server helper for time-limited IP blocks.
//
// IP DERIVATION (reused, not reinvented): callers pass clientIp(req)
// from lib/rate-limit.ts — the codebase's ONE existing convention,
// already used by every rate limit (signup, manual-proof, AI routes,
// ...). It takes the first entry of x-forwarded-for, falls back to
// x-real-ip, else "unknown". On Vercel those headers are set by the
// platform's edge, so this is the same trust model the rate limits
// already rely on — no new header-trust rule is introduced here, and
// no header is trusted beyond what the existing code already does.
// "unknown" is never blocked or recorded: blocking it would block
// every request that arrived without an IP header.
//
// THRESHOLDS — events of one kind from one IP inside a trailing 24h
// window. Deliberately HIGH so ordinary users are never blocked:
// a typo or two, a corrupt screenshot upload, or a few wrong admin
// passwords cannot come close. Only sustained, high-velocity abuse
// trips a block, and the block always expires after 24 hours.
//
//   signup_abuse   30  — signup rate-limit (429) hits. The signup
//                        limit itself is 10/hour/IP, so 30 events
//                        means hours of sustained hammering.
//   admin_failure  50  — failed admin logins. The per-email lockout
//                        already fires at 5 failures / 15 min; the IP
//                        threshold is 10x that, because (per the
//                        admin/login comment) client IPs vary between
//                        requests, so an IP signal here is weak and
//                        must be corroborated by sheer volume.
//   fake_payment   30  — manual-proof rate-limit (429) hits plus
//                        rejected non-image "proof" uploads.
//   payment_abuse  30  — payment create-order rate-limit (429) hits
//                        (limit: 30 creations / minute / IP).
//
// WHAT COUNTS (and what does not): velocity plus FAILED/abusive
// attempts only. Changing IPs alone is NOT proof of fraud — mobile
// networks rotate addresses and CGNAT shares one address across many
// households — so IP change is never recorded as an event, and no
// block is ever issued for it.
//
// DELIBERATELY NOT BUILT: VPN/proxy detection (unreliable without a
// paid IP-intelligence API), account-IP chaining / fingerprinting,
// User-Agent blocking (UA is trivially spoofed — it is not stored or
// consulted here at all), and permanent blocks (the SQL CHECK caps
// every block at 24 hours from creation; see supabase/ip-blocks.sql).
//
// FAIL-OPEN (critical): every function below returns a safe default
// on ANY failure — no service client, table not yet applied by the
// owner, query error, timeout — so routes work normally until the
// owner applies supabase/ip-blocks.sql. Blocking must never lock out
// legitimate users because of a missing table. Nothing here ever
// throws, and nothing here ever blocks on a DB error.
// This is unrelated to lib/engine/blocklist.ts (the business
// unsubscribe blocklist of domains/emails) — never mix the two.

export const IP_ABUSE_WINDOW_MS = 24 * 3600_000;
export const IP_BLOCK_DURATION_MS = 24 * 3600_000;

export type IpAbuseKind = "signup_abuse" | "admin_failure" | "fake_payment" | "payment_abuse";

export const IP_BLOCK_THRESHOLDS: Record<IpAbuseKind, number> = {
  signup_abuse: 30,
  admin_failure: 50,
  fake_payment: 30,
  payment_abuse: 30,
};

/** Normalise an IP for storage/lookup; "" means "do not block/record". */
function normIp(ip: string): string {
  const v = (ip || "").trim().slice(0, 128);
  if (!v || v === "unknown") return "";
  return v;
}

/** Derive the caller IP exactly as the rest of the codebase does. */
export function abuseIp(req: Request): string {
  return clientIp(req);
}

/** True only when a live, unexpired block row exists. Fail-open: false on any error. */
export async function isIpBlocked(ip: string): Promise<boolean> {
  const norm = normIp(ip);
  if (!norm) return false;
  try {
    const admin = serviceClient();
    if (!admin) return false;
    const { data, error } = await admin
      .from("ip_blocks")
      .select("blocked_until")
      .eq("ip", norm)
      .gt("blocked_until", new Date().toISOString())
      .limit(1);
    if (error || !data || !data[0]) return false;
    return new Date((data[0] as { blocked_until: string }).blocked_until).getTime() > Date.now();
  } catch {
    return false;
  }
}

/**
 * Record one abuse event; when the trailing-24h count for this IP+kind
 * reaches its threshold, upsert a 24-hour block. Best-effort and
 * fail-open: any error silently ends the call, never the request.
 * The upsert resets created_at so the SQL 24h cap is measured from
 * the latest block, and re-blocking after expiry works.
 */
export async function recordAbuseEvent(ip: string, kind: IpAbuseKind): Promise<void> {
  const norm = normIp(ip);
  if (!norm) return;
  try {
    const admin = serviceClient();
    if (!admin) return;
    const { error: insertErr } = await admin.from("ip_abuse_events").insert({ ip: norm, kind });
    if (insertErr) return; // table not applied yet, or any DB error: fail open
    const since = new Date(Date.now() - IP_ABUSE_WINDOW_MS).toISOString();
    const { count, error: countErr } = await admin
      .from("ip_abuse_events")
      .select("id", { count: "exact", head: true })
      .eq("ip", norm)
      .eq("kind", kind)
      .gte("created_at", since);
    if (countErr || (count ?? 0) < IP_BLOCK_THRESHOLDS[kind]) return;
    const now = new Date();
    const until = new Date(now.getTime() + IP_BLOCK_DURATION_MS).toISOString();
    await admin.from("ip_blocks").upsert(
      {
        ip: norm,
        blocked_until: until,
        reason: `${kind} threshold (${IP_BLOCK_THRESHOLDS[kind]} in 24h)`,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "ip" },
    );
  } catch {
    // Fail open: recording must never break the request it observes.
  }
}

/**
 * Generic block response: 403 with no detail. A blocked caller must
 * not learn whether the IP is blocked, the threshold, or the expiry —
 * anything more helps an attacker probe the defence.
 */
export function blockedResponse(): NextResponse {
  return NextResponse.json({ error: "Forbidden." }, { status: 403 });
}

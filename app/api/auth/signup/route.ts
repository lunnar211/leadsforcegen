import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isDisposableEmail } from "@/lib/auth/disposable";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { blockedResponse, isIpBlocked, recordAbuseEvent } from "@/lib/ip-blocks";
import { sendTelegram } from "@/lib/telegram";

/**
 * Server-side signup — the ONLY path that creates password accounts.
 *
 * Why not direct supabase.auth.signUp from the browser? Because a
 * browser-side check is bypassable: anyone can call the Supabase API
 * directly with a temp-mail address and spin up bot accounts. This
 * route enforces, before any account exists:
 *   1. Strict input validation: email local/domain parts allow only
 *      letters, digits and . _ % + - (no quotes, spaces, semicolons
 *      or other SQL metacharacters — the old loose shape check let
 *      a quote-containing address through to account creation), and
 *      passwords are capped at 72 characters (the bcrypt/GoTrue
 *      limit) instead of relying on Supabase to reject them.
 *   2. Rate limit: 10 signups/hour per IP + 5/hour per email, so a
 *      bot farm can't mass-create accounts even with real domains.
 *   3. Disposable-domain block: 9,927 known temp-mail domains
 *      (community blocklist snapshot) — exact domain or subdomain.
 * The account is created pre-confirmed (email confirmation is OFF by
 * design); the browser then signs in with the same password to get
 * its session, exactly as before. Google OAuth signups are untouched
 * — Google accounts are verified by Google, temp-mail can't pass.
 */
export async function POST(req: Request) {
  // IP block check FIRST (fail-open until the owner applies
  // supabase/ip-blocks.sql): a blocked IP gets a generic 403 before
  // any validation, rate limiting, or account work happens.
  const ip = clientIp(req);
  if (await isIpBlocked(ip)) return blockedResponse();
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }
  if (password.length > 72) {
    return NextResponse.json({ error: "Password must be at most 72 characters." }, { status: 400 });
  }

  if (!(await rateLimit(`signup:ip:${ip}`, 10, 3_600_000))) {
    // Signup-abuse signal: only the per-IP limit trip counts toward
    // an IP block (a per-email trip is about the email, not the IP).
    // 30 such hits in 24h auto-blocks the IP for 24h (lib/ip-blocks).
    await recordAbuseEvent(ip, "signup_abuse");
    return NextResponse.json(
      { error: "Too many signup attempts from this connection. Try again later." },
      { status: 429 },
    );
  }
  if (!(await rateLimit(`signup:email:${email.toLowerCase()}`, 5, 3_600_000))) {
    return NextResponse.json(
      { error: "Too many signup attempts for this email. Try again later." },
      { status: 429 },
    );
  }

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      {
        error:
          "Temporary or disposable email addresses can't be used to sign up. Please use a work or personal email address.",
      },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: "Signup is not configured." }, { status: 503 });
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // confirmation OFF by design — matches previous behaviour
  });
  if (error) {
    if (/already (registered|exists)|duplicate/i.test(error.message)) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try logging in instead." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Fail-open admin alert: scheduled with after() so it runs after
  // the response is sent (zero latency for the user) AND the
  // serverless runtime guarantees it executes — a bare floating
  // promise could be cut off when the function returns. Email only
  // — no password or token, ever. New accounts are free by design,
  // hence "(free)".
  after(() => sendTelegram(`New signup: ${email} (free) at ${new Date().toISOString()}`));
  return NextResponse.json({ ok: true });
}

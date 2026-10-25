import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isDisposableEmail } from "@/lib/auth/disposable";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/telegram";

/**
 * Server-side signup — the ONLY path that creates password accounts.
 *
 * Why not direct supabase.auth.signUp from the browser? Because a
 * browser-side check is bypassable: anyone can call the Supabase API
 * directly with a temp-mail address and spin up bot accounts. This
 * route enforces, before any account exists:
 *   1. Rate limit: 10 signups/hour per IP + 5/hour per email, so a
 *      bot farm can't mass-create accounts even with real domains.
 *   2. Disposable-domain block: 9,927 known temp-mail domains
 *      (community blocklist snapshot) — exact domain or subdomain.
 * The account is created pre-confirmed (email confirmation is OFF by
 * design); the browser then signs in with the same password to get
 * its session, exactly as before. Google OAuth signups are untouched
 * — Google accounts are verified by Google, temp-mail can't pass.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const ip = clientIp(req);
  if (!(await rateLimit(`signup:ip:${ip}`, 10, 3_600_000))) {
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
  // Fail-open admin alert: fire-and-forget, never awaited, never
  // blocks the signup response. Email only — no password or token,
  // ever. New accounts are free by design, hence "(free)".
  sendAdminAlert(`New signup: ${email} (free) at ${new Date().toISOString()}`);
  return NextResponse.json({ ok: true });
}

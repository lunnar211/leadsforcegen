import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Records a business on the unsubscribe blocklist. The Search Everywhere
// engine must check this list and exclude matching domains/emails from all
// future results. Stored in Supabase (unsubscribe_blocklist) with the
// service-role key — server-side only.
export async function POST(req: Request) {
  if (!(await rateLimit(`unsubscribe:${clientIp(req)}`, 10, 60_000))) {
    return NextResponse.json({ ok: false, error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { domain?: string; email?: string; company?: string };
  const domain = (body.domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const email = (body.email || "").trim().toLowerCase();
  const company = (body.company || "").trim();
  if (!domain && !email) {
    return NextResponse.json({ ok: false, error: "Provide at least a business domain or an email address." }, { status: 400 });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "That email address does not look valid." }, { status: 400 });
  }
  if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
    return NextResponse.json({ ok: false, error: "That domain does not look valid." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "Unsubscribe storage is not configured on the server yet. Please email the site owner directly and you will be removed." },
      { status: 503 },
    );
  }
  const admin = createClient(url, serviceKey);
  const { error } = await admin
    .from("unsubscribe_blocklist")
    .insert({ domain: domain || null, email: email || null, company: company || null });
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not record the request. Please try again or email the site owner." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, data: { recorded: true } });
}

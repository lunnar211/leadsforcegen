import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner-only site settings (site_settings key/value). Allowed keys are
// whitelisted here; values are stored as JSON. The public /api/settings
// route exposes only the banner.
const ALLOWED = new Set(["banner", "site_name", "maintenance"]);

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const { data, error } = await admin.from("site_settings").select("key, value");
  if (error) return NextResponse.json({ ok: true, data: { settings: {}, activated: false } });
  const settings: Record<string, unknown> = {};
  for (const row of data || []) settings[row.key as string] = row.value;
  return NextResponse.json({ ok: true, data: { settings, activated: true } });
}

export async function POST(req: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { key?: string; value?: unknown };
  if (!body.key || !ALLOWED.has(body.key)) return NextResponse.json({ ok: false, error: "Unknown setting." }, { status: 400 });
  const { error } = await admin.from("site_settings").upsert({ key: body.key, value: body.value ?? null, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ ok: false, error: "Settings are not activated yet — run the latest supabase/schema.sql in the Supabase SQL editor." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

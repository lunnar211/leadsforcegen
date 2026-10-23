import { NextResponse } from "next/server";
import { connection } from "next/server";
import { serviceClient } from "@/lib/quota";

// Public site settings — ONLY the announcement banner is exposed here.
// Everything else in site_settings stays behind the admin session.
export async function GET() {
  await connection();
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: true, data: { banner: null } });
  try {
    const { data } = await admin.from("site_settings").select("key, value").in("key", ["banner", "maintenance"]);
    const map: Record<string, unknown> = {};
    for (const row of data || []) map[row.key as string] = row.value;
    return NextResponse.json({ ok: true, data: { banner: map.banner || null, maintenance: map.maintenance || null } });
  } catch {
    return NextResponse.json({ ok: true, data: { banner: null, maintenance: null } });
  }
}

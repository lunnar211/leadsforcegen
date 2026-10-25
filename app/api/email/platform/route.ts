import { NextResponse } from "next/server";
import { requireProUser } from "@/lib/email/guard";
import { platformSenderConfigured } from "@/lib/email/platform";

// Availability probe for the env-gated platform sender option. Returns
// only a boolean — the platform address and key never leave the server,
// so the panel can hide the option entirely when they are unset.
export async function GET(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  return NextResponse.json({ ok: true, data: { available: platformSenderConfigured() } });
}

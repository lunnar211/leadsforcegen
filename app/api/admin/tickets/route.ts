import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner-only support inbox: list tickets, set status, save a reply.
// The reply is stored on the ticket and shown to the user in their
// dashboard support card the next time they load it.
export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const { data, error } = await admin.from("support_tickets").select("id, email, subject, message, status, admin_reply, created_at").order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ ok: true, data: { tickets: [], activated: false } });
  return NextResponse.json({ ok: true, data: { tickets: data || [], activated: true } });
}

export async function POST(req: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; status?: string; admin_reply?: string };
  if (!body.id) return NextResponse.json({ ok: false, error: "Missing ticket id." }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status && ["open", "answered", "closed"].includes(body.status)) patch.status = body.status;
  if (typeof body.admin_reply === "string") {
    patch.admin_reply = body.admin_reply.slice(0, 4000);
    if (body.admin_reply.trim() && !body.status) patch.status = "answered";
  }
  const { error } = await admin.from("support_tickets").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, error: "Could not update the ticket." }, { status: 400 });
  return NextResponse.json({ ok: true });
}

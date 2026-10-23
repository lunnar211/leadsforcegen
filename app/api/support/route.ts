import { NextResponse } from "next/server";
import { getAuthUser, serviceClient } from "@/lib/quota";

// User-facing support: a signed-in user creates a ticket and lists their
// own tickets (with the admin's replies). Rows are read/written with the
// service role but ALWAYS scoped to the caller's own user id / email.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Support is not available right now." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { subject?: string; message?: string };
  const subject = String(body.subject || "").trim().slice(0, 140);
  const message = String(body.message || "").trim().slice(0, 4000);
  if (subject.length < 3 || message.length < 5) {
    return NextResponse.json({ ok: false, error: "Add a short subject and a few words about the issue." }, { status: 400 });
  }
  const { error } = await admin.from("support_tickets").insert({ user_id: user.id, email: user.email || "", subject, message });
  if (error) return NextResponse.json({ ok: false, error: "Support is being connected — please try again shortly." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Support is not available right now." }, { status: 503 });
  const { data, error } = await admin
    .from("support_tickets")
    .select("id, subject, message, status, admin_reply, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ ok: true, data: { tickets: [] } });
  return NextResponse.json({ ok: true, data: { tickets: data || [] } });
}

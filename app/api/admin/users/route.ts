import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner-only admin data + user controls. Everything is served by this
// server route (signed admin session + service role) because RLS gives
// the browser client no admin access. The response includes the payments
// ledger across ALL gateways so the owner can see every verified payment
// (status 'captured' only ever results from a server-verified payment or
// an approved manual proof — never from a browser success callback).
export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const [users, searches, leads, activity, payments] = await Promise.all([
    admin.from("profiles").select("id, email, plan, role, is_active, created_at").order("created_at", { ascending: false }).limit(200),
    admin.from("searches").select("*", { count: "exact", head: true }),
    admin.from("leads").select("*", { count: "exact", head: true }),
    admin.from("activity_log").select("message, created_at").order("created_at", { ascending: false }).limit(15),
    admin
      .from("payments")
      .select("id, email, gateway, amount, currency, status, method, months, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);
  if (users.error) return NextResponse.json({ ok: false, error: "Could not load users." }, { status: 502 });

  const rows = users.data || [];
  return NextResponse.json({
    ok: true,
    data: {
      users: rows,
      stats: {
        users: rows.length,
        searches: searches.count || 0,
        leads: leads.count || 0,
        pro: rows.filter((u) => u.plan === "pro").length,
      },
      activity: (activity.data || []).map((a) => a.message as string),
      payments: payments.data || [],
    },
  });
}

export async function POST(req: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; action?: string };
  if (!body.id || (body.action !== "toggle-plan" && body.action !== "toggle-active")) {
    return NextResponse.json({ ok: false, error: "Provide id and action (toggle-plan|toggle-active)." }, { status: 400 });
  }
  const { data: target, error } = await admin
    .from("profiles")
    .select("id, email, plan, role, is_active")
    .eq("id", body.id)
    .single();
  if (error || !target) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  if (target.role === "admin") {
    return NextResponse.json({ ok: false, error: "Admin accounts cannot be changed from the panel." }, { status: 403 });
  }

  const patch = body.action === "toggle-plan"
    ? { plan: target.plan === "pro" ? "free" : "pro" }
    : { is_active: !target.is_active };
  const { error: updErr } = await admin.from("profiles").update(patch).eq("id", body.id);
  if (updErr) return NextResponse.json({ ok: false, error: "Update failed." }, { status: 502 });

  await admin.from("activity_log").insert({
    user_id: target.id,
    message: body.action === "toggle-plan"
      ? `Admin set plan to ${patch.plan} for ${target.email || target.id}`
      : `Admin ${patch.is_active ? "reactivated" : "deactivated"} ${target.email || target.id}`,
  });
  return NextResponse.json({ ok: true, data: { id: target.id, ...patch } });
}

import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner-only activity timeline: real events merged from the source
// tables, newest first, capped at 50. No demo or sample strings ever:
// when a table read fails, the events from the tables that worked are
// still returned with partial: true so the panel can say so honestly.
// Payments carry gateway/amount/currency/status only — never a proof
// path or any payment-instruction body.
type ActivityEvent = { type: string; at: string; summary: string };

function fmtAmount(amount: unknown): string {
  const n = Number(amount);
  return Number.isFinite(n) ? n.toLocaleString() : String(amount ?? "—");
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const events: ActivityEvent[] = [];
  const failed: string[] = [];

  const [signups, payments, approvals, tickets, coupons] = await Promise.all([
    admin.from("profiles").select("email, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("payments").select("email, gateway, amount, currency, status, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("activity_log").select("message, created_at").ilike("message", "%approved%").order("created_at", { ascending: false }).limit(20),
    admin.from("support_tickets").select("email, subject, status, created_at").order("created_at", { ascending: false }).limit(20),
    admin.from("coupons").select("code, percent_off, created_at").order("created_at", { ascending: false }).limit(20),
  ]);

  if (signups.error) failed.push("signups");
  else for (const r of signups.data || []) {
    events.push({ type: "signup", at: r.created_at as string, summary: `New signup: ${(r.email as string) || "unknown address"}` });
  }

  if (payments.error) failed.push("payments");
  else for (const r of payments.data || []) {
    events.push({
      type: "payment",
      at: r.created_at as string,
      summary: `Payment ${r.status as string} — ${(r.email as string) || "unknown buyer"} · ${r.gateway as string} ${(r.currency as string) || ""} ${fmtAmount(r.amount)}`.trim(),
    });
  }

  // Approvals: the payments table has no updated_at, so the approval
  // record is the activity_log row written at approval time by the
  // manual-payment review path ("Manual payment approved — …").
  if (approvals.error) failed.push("approvals");
  else for (const r of approvals.data || []) {
    events.push({ type: "approval", at: r.created_at as string, summary: r.message as string });
  }

  if (tickets.error) failed.push("tickets");
  else for (const r of tickets.data || []) {
    events.push({
      type: "ticket",
      at: r.created_at as string,
      summary: `Support ticket (${r.status as string}): ${r.subject as string} — ${(r.email as string) || "unknown address"}`,
    });
  }

  if (coupons.error) failed.push("coupons");
  else for (const r of coupons.data || []) {
    events.push({
      type: "coupon",
      at: r.created_at as string,
      summary: `Coupon created: ${r.code as string} (${r.percent_off as number}% off)`,
    });
  }

  events.sort((a, b) => {
    const ta = new Date(a.at).getTime();
    const tb = new Date(b.at).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });

  return NextResponse.json({
    ok: true,
    partial: failed.length > 0,
    failed,
    events: events.slice(0, 50),
  });
}

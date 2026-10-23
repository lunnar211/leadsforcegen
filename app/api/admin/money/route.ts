import { NextResponse } from "next/server";
import { requireAdminSession, serviceClient } from "@/lib/adminDb";

// Owner money management: real aggregates computed from the payments
// ledger (never estimated, never mixed across currencies — amounts are
// stored in whole currency units). A payment counts as revenue only in
// status 'captured', which the server sets solely after gateway
// signature/webhook verification or the owner's manual-proof approval.
type PaymentRow = {
  id: string; email: string | null; user_id: string | null; gateway: string;
  amount: number; currency: string; status: string; method: string | null;
  months: number | null; created_at: string;
};

function addTo(map: Record<string, number>, currency: string, amount: number) {
  map[currency] = (map[currency] || 0) + amount;
}

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const admin = serviceClient();
  if (!admin) return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });

  const { data: payData, error } = await admin
    .from("payments")
    .select("id, email, user_id, gateway, amount, currency, status, method, months, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ ok: false, error: "Could not load payments." }, { status: 502 });
  const payments = (payData || []) as PaymentRow[];

  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const captured: Record<string, number> = {};
  const capturedThisMonth: Record<string, number> = {};
  const pendingSums: Record<string, number> = {};
  const refunded: Record<string, number> = {};
  let pendingCount = 0;
  let capturedCount = 0;
  let rejectedCount = 0;
  const byGatewayMap = new Map<string, { gateway: string; capturedCount: number; capturedSums: Record<string, number>; pendingCount: number }>();

  for (const p of payments) {
    const g = byGatewayMap.get(p.gateway) || { gateway: p.gateway, capturedCount: 0, capturedSums: {}, pendingCount: 0 };
    byGatewayMap.set(p.gateway, g);
    if (p.status === "captured") {
      capturedCount += 1;
      addTo(captured, p.currency, p.amount);
      if (new Date(p.created_at).getTime() >= monthStart) addTo(capturedThisMonth, p.currency, p.amount);
      g.capturedCount += 1;
      addTo(g.capturedSums, p.currency, p.amount);
    } else if (p.status === "pending") {
      pendingCount += 1;
      addTo(pendingSums, p.currency, p.amount);
      g.pendingCount += 1;
    } else if (p.status === "refunded") {
      addTo(refunded, p.currency, p.amount);
    } else if (p.status === "rejected") {
      rejectedCount += 1;
    }
  }

  // Active subscriptions with owner-readable emails and period ends.
  const { data: subData } = await admin
    .from("subscriptions")
    .select("user_id, plan, gateway, current_period_end")
    .eq("status", "active")
    .order("current_period_end", { ascending: true })
    .limit(100);
  const subUserIds = [...new Set((subData || []).map((s) => s.user_id).filter(Boolean))] as string[];
  const emailById = new Map<string, string>();
  if (subUserIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, email").in("id", subUserIds);
    for (const pr of profs || []) emailById.set(pr.id as string, (pr.email as string) || "");
  }
  const subscriptions = (subData || []).map((s) => ({
    email: (s.user_id && emailById.get(s.user_id)) || "—",
    plan: s.plan as string,
    gateway: (s.gateway as string) || "—",
    current_period_end: s.current_period_end as string | null,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      captured, capturedThisMonth, refunded,
      pending: { count: pendingCount, sums: pendingSums },
      capturedCount, rejectedCount,
      byGateway: [...byGatewayMap.values()],
      subscriptions,
      payments: payments.slice(0, 50),
    },
  });
}

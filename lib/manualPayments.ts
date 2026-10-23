import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Core review logic for manual (eSewa/Khalti/bank) payments, shared by
// the /admin panel API and the Telegram admin bot so both paths apply
// exactly the same effects. Approve = money seen in the owner's account:
// the payment is captured, the buyer's profile goes Pro, a subscription
// period is recorded. Refund only marks the ledger — manual gateways
// have no refund API; the owner returns the money out-of-band.
export type ReviewResult =
  | { ok: true; status: string; periodEnd?: string }
  | { ok: false; error: string; httpStatus: number };

export async function reviewManualPayment(
  admin: SupabaseClient,
  id: string,
  action: "approve" | "reject" | "refund",
): Promise<ReviewResult> {
  const { data: payment, error: readErr } = await admin
    .from("payments")
    .select("id, user_id, email, months, status, amount, currency, method")
    .eq("id", id)
    .eq("gateway", "manual")
    .single();
  if (readErr || !payment) return { ok: false, error: "Payment not found.", httpStatus: 404 };

  if (action === "refund") {
    if (payment.status !== "captured") {
      return { ok: false, error: `Only a captured payment can be marked refunded (this one is ${payment.status}).`, httpStatus: 409 };
    }
    await admin.from("payments").update({ status: "refunded" }).eq("id", id);
    await admin.from("activity_log").insert({
      user_id: payment.user_id,
      message: `Admin marked manual payment refunded — ${payment.currency} ${Number(payment.amount).toLocaleString()} to ${payment.email || payment.user_id || "unknown buyer"} (money returned by owner via ${payment.method || "manual method"})`,
    });
    return { ok: true, status: "refunded" };
  }

  if (payment.status !== "pending") {
    return { ok: false, error: `Already ${payment.status}.`, httpStatus: 409 };
  }

  if (action === "reject") {
    await admin.from("payments").update({ status: "rejected" }).eq("id", id);
    return { ok: true, status: "rejected" };
  }

  // Approve: mark captured and activate Pro for the subscription period.
  await admin.from("payments").update({ status: "captured" }).eq("id", id);
  const months = Number(payment.months || 1);
  const periodEnd = new Date(Date.now() + months * 30 * 24 * 3600_000).toISOString();
  if (payment.user_id) {
    await admin.from("profiles").update({ plan: "pro" }).eq("id", payment.user_id);
    await admin.from("subscriptions").insert({
      user_id: payment.user_id,
      plan: "pro",
      status: "active",
      gateway: "manual",
      current_period_end: periodEnd,
    });
    await admin.from("activity_log").insert({
      user_id: payment.user_id,
      message: `Manual payment approved — Pro active for ${months} month(s) until ${periodEnd.slice(0, 10)}`,
    });
  }
  return { ok: true, status: "captured", periodEnd };
}

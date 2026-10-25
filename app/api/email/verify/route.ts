import { NextResponse } from "next/server";
import { requireProUser } from "@/lib/email/guard";
import { extractEmails, verifyEmails } from "@/lib/email/extract";
import { getBlocklist, isBlocked } from "@/lib/engine/blocklist";

// Filter + verify a pasted/uploaded list BEFORE sending: returns which
// addresses are real (MX record present) and which are dead. Caps at
// 200 per call so one verify can't burn the whole function budget.
// Blocked check: the same unsubscribe blocklist source the send and
// drain routes use (getBlocklist/isBlocked) is re-checked here, and a
// blocked address goes into the Blocked bucket — never into Valid —
// even though send/drain would refuse it anyway. If the blocklist
// fetch fails, getBlocklist falls back to its last-known list (empty
// only if never fetched), so verify degrades to the old display
// rather than failing; send/drain remain the enforcement point.
export async function POST(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.emails) ? body.emails.join("\n") : String(body.text || "");
  const emails = extractEmails(raw).slice(0, 200);
  if (!emails.length) {
    return NextResponse.json({ ok: true, data: { results: [], valid: [], invalid: [], blocked: [] } });
  }
  const results = await verifyEmails(emails);
  const blocklist = await getBlocklist();
  const blockedSet = new Set(
    results.filter((r) => isBlocked({ email: r.email }, blocklist)).map((r) => r.email),
  );
  return NextResponse.json({
    ok: true,
    data: {
      results,
      valid: results.filter((r) => r.mx && !blockedSet.has(r.email)).map((r) => r.email),
      invalid: results.filter((r) => !r.mx && !blockedSet.has(r.email)).map((r) => r.email),
      blocked: [...blockedSet],
    },
  });
}

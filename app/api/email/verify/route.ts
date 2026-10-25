import { NextResponse } from "next/server";
import { requireProUser } from "@/lib/email/guard";
import { extractEmails, verifyEmails } from "@/lib/email/extract";

// Filter + verify a pasted/uploaded list BEFORE sending: returns which
// addresses are real (MX record present) and which are dead. Caps at
// 200 per call so one verify can't burn the whole function budget.
export async function POST(req: Request) {
  const auth = await requireProUser(req);
  if ("status" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body.emails) ? body.emails.join("\n") : String(body.text || "");
  const emails = extractEmails(raw).slice(0, 200);
  if (!emails.length) {
    return NextResponse.json({ ok: true, data: { results: [], valid: [], invalid: [] } });
  }
  const results = await verifyEmails(emails);
  return NextResponse.json({
    ok: true,
    data: {
      results,
      valid: results.filter((r) => r.mx).map((r) => r.email),
      invalid: results.filter((r) => !r.mx).map((r) => r.email),
    },
  });
}

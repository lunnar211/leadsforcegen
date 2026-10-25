import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";
import { reencodeProof } from "@/lib/proof-image";

export const maxDuration = 30;

// Admin-only proof preview, served through this proxy — never as a
// direct storage URL. A signed URL was rejected for this job:
//  - it serves the ORIGINAL stored bytes straight from Supabase with
//    Supabase's headers (no nosniff/sandbox control), and
//  - the URL itself is a bearer token valid for 600s — anyone holding
//    it can fetch the original.
// The proxy instead gates every view behind the admin session cookie,
// re-encodes the stored bytes (so even legacy rows uploaded before
// re-encoding existed never reach the admin's browser in original
// form), and serves them with nosniff + sandbox headers.
export async function GET(req: Request) {
  const store = await cookies();
  if (!verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ ok: false, error: "Admin session required." }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 503 });
  }
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "Provide a payment id." }, { status: 400 });
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  // The storage path comes from the DB row, never from the request —
  // there is no path parameter to traverse, and only manual-payment
  // rows are servable here.
  const { data: row } = await admin
    .from("payments")
    .select("proof_path")
    .eq("id", id)
    .eq("gateway", "manual")
    .limit(1)
    .single();
  if (!row?.proof_path) {
    return NextResponse.json({ ok: false, error: "Proof not found." }, { status: 404 });
  }
  const { data: blob, error } = await admin.storage.from("payment-proofs").download(row.proof_path);
  if (error || !blob) {
    return NextResponse.json({ ok: false, error: "Could not load the proof." }, { status: 502 });
  }
  const stored = new Uint8Array(await blob.arrayBuffer());
  let clean: { bytes: Buffer; contentType: "image/jpeg" };
  try {
    clean = await reencodeProof(stored);
  } catch {
    return NextResponse.json({ ok: false, error: "That proof image could not be read." }, { status: 502 });
  }
  return new Response(new Uint8Array(clean.bytes), {
    headers: {
      "Content-Type": clean.contentType,
      "X-Content-Type-Options": "nosniff",
      // Even if the bytes were somehow not an image, the document is
      // sandboxed: no scripts, no forms, no same-origin access.
      "Content-Security-Policy": "sandbox",
      "Content-Disposition": 'inline; filename="proof.jpg"',
      "Cache-Control": "no-store",
    },
  });
}

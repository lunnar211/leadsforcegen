import { cookies } from "next/headers";
import { connection } from "next/server";
import { ADMIN_COOKIE, verifyAdminSessionToken } from "@/lib/adminAuth";

// Server-verified admin check for UI gating (e.g. the Nav only shows the
// Admin link when this returns true). The panel itself re-checks the same
// signed cookie server-side; this endpoint reveals nothing but a boolean.
export async function GET() {
  await connection();
  const store = await cookies();
  const isAdmin = verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
  return Response.json({ isAdmin });
}

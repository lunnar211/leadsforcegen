import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import AdminLogin from "@/components/AdminLogin";
import AdminPanel from "@/components/AdminPanel";
import { ADMIN_COOKIE, isAdminConfigured, verifyAdminSessionToken } from "@/lib/adminAuth";

// Server-side gate: the admin panel UI is only rendered for a request that
// carries a valid, signed admin session cookie (issued by /api/admin/login
// after the owner email + password check). Everyone else sees only the
// admin login form — no panel data is sent to them.
async function AdminGate() {
  await connection();
  const store = await cookies();
  const authed = verifyAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
  if (!authed) {
    return <AdminLogin configured={isAdminConfigured()} />;
  }
  return <AdminPanel />;
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14 text-muted">Loading…</div>}>
      <AdminGate />
    </Suspense>
  );
}

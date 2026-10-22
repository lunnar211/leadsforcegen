"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ensureProfile } from "@/lib/profile";

// OAuth return page. The Supabase browser client (PKCE flow,
// detectSessionInUrl) exchanges the ?code= parameter for a session
// automatically when it loads; we wait for that session, then continue.
function CallbackInner() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const { data } = await client.auth.getSession();
      if (data.session) {
        clearInterval(timer);
        await ensureProfile();
        router.push("/dashboard");
        router.refresh();
      } else if (tries >= 16) {
        clearInterval(timer);
        setFailed(true);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-14 text-center">
      <h1 className="text-2xl font-semibold text-fg">LeadsForceGen</h1>
      {!supabase ? (
        <p className="mt-3 text-sm text-muted">Supabase is not configured in this environment.</p>
      ) : failed ? (
        <>
          <p className="mt-3 text-sm text-danger" role="alert">
            Sign-in did not complete. The link may have expired or the provider is not enabled yet.
          </p>
          <Link href="/login" className="btn-primary mt-5">Back to login</Link>
        </>
      ) : (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted" role="status">
          <span className="spinner" aria-hidden="true" /> Finishing sign-in…
        </p>
      )}
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-4 py-14 text-center text-sm text-muted">Finishing sign-in…</div>}>
      <CallbackInner />
    </Suspense>
  );
}

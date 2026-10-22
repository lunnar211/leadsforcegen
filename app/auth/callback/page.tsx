"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// OAuth return page. The Supabase browser client (PKCE flow,
// detectSessionInUrl) exchanges the ?code= parameter for a session
// automatically when it loads; we wait for that session, then continue.
export default function AuthCallback() {
  const router = useRouter();
  const [msg, setMsg] = useState("Finishing sign-in...");

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setMsg("Supabase is not configured in this environment.");
      return;
    }
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const { data } = await client.auth.getSession();
      if (data.session) {
        clearInterval(timer);
        router.push("/dashboard");
      } else if (tries >= 10) {
        clearInterval(timer);
        setMsg("Sign-in did not complete. Please try logging in again.");
      }
    }, 500);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-4 py-14 text-center">
      <h1 className="text-xl font-semibold text-white">LeadsForceGen</h1>
      <p className="mt-3 text-sm text-slate-300">{msg}</p>
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// The Supabase client is loaded lazily inside effects/handlers so its JS
// stays out of the first paint bundle on every page (Lighthouse TBT).
type SupabaseModule = typeof import("@/lib/supabaseClient");
let supabaseModule: SupabaseModule | null = null;
async function loadSupabase(): Promise<SupabaseModule> {
  if (!supabaseModule) supabaseModule = await import("@/lib/supabaseClient");
  return supabaseModule;
}

type Theme = "light" | "dark";

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem("lfg-theme", t);
  } catch {
    /* storage unavailable */
  }
}

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isAdmin, setIsAdmin] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Deferred to the next frame: the pre-paint script owns the initial
    // theme; this only syncs the toggle icon with it.
    const raf = requestAnimationFrame(() => {
      setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    });
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/me");
        const d = (await res.json().catch(() => ({}))) as { isAdmin?: boolean };
        if (!cancelled) setIsAdmin(Boolean(d.isAdmin));
      } catch {
        /* nav still works without the admin link */
      }
    })();
    let unsubscribe: (() => void) | undefined;
    loadSupabase().then(({ supabase }) => {
      if (cancelled || !supabase) return;
      supabase.auth.getSession().then(({ data }) => {
        if (!cancelled) setSignedIn(Boolean(data.session));
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
        setSignedIn(Boolean(session));
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      unsubscribe?.();
    };
  }, []);

  // Close the mobile panel on navigation (adjust-state-on-render pattern).
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      applyTheme(next);
      return next;
    });
  }, []);

  async function signOut() {
    const { supabase } = await loadSupabase();
    if (supabase) await supabase.auth.signOut();
    setSignedIn(false);
    router.push("/");
    router.refresh();
  }

  const linkCls =
    "inline-flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium text-muted hover:text-fg transition-colors";
  const panelLinkCls =
    "flex items-center min-h-[44px] px-3 rounded-lg text-base font-medium text-fg hover:bg-surface transition-colors";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto w-full max-w-[1200px] px-4">
        <div className="flex h-16 items-center justify-between gap-2">
          <Link href="/" className="font-bold text-lg text-fg whitespace-nowrap" aria-label="LeadsForceGen home">
            ⚡ LeadsForceGen
          </Link>

          {/* Desktop nav (≥768px) */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            <Link href="/dashboard" className={linkCls}>Dashboard</Link>
            {isAdmin && (
              <Link href="/admin" className={linkCls}>Admin</Link>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              className={linkCls}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            {signedIn ? (
              <button type="button" onClick={signOut} className={linkCls}>Sign out</button>
            ) : (
              <>
                <Link href="/login" className={linkCls}>Login</Link>
                <Link href="/signup" className="btn-primary ml-1 !min-h-[44px]">Get started</Link>
              </>
            )}
          </nav>

          {/* Mobile controls (<768px) */}
          <div className="flex md:hidden items-center gap-1">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-muted"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-fg"
              aria-expanded={open}
              aria-controls="mobile-nav-panel"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((v) => !v)}
            >
              <span aria-hidden="true" className="text-2xl leading-none">{open ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile slide-down panel */}
      <div id="mobile-nav-panel" className="nav-panel md:hidden border-border" data-open={open} style={{ borderTopWidth: open ? 1 : 0 }}>
        <div>
          <nav className="px-4 py-2 flex flex-col" aria-label="Mobile">
            <Link href="/dashboard" className={panelLinkCls}>Dashboard</Link>
            {isAdmin && (
              <Link href="/admin" className={panelLinkCls}>Admin</Link>
            )}
            {signedIn ? (
              <button type="button" onClick={signOut} className={`${panelLinkCls} text-left`}>Sign out</button>
            ) : (
              <>
                <Link href="/login" className={panelLinkCls}>Login</Link>
                <Link href="/signup" className="btn-primary btn-block my-2">Get started</Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}

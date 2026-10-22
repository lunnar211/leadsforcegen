import Link from "next/link";

export default function Nav() {
  return (
    <header className="border-b border-white/10 bg-slate-950/80 sticky top-0 z-20 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-bold text-lg text-white">⚡ LeadsForceGen</Link>
        <nav className="flex gap-4 text-sm text-slate-300">
          <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
          <Link href="/admin" className="hover:text-white">Admin</Link>
          <Link href="/login" className="hover:text-white">Login</Link>
          <Link href="/signup" className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500">Get started</Link>
        </nav>
      </div>
    </header>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-5xl font-extrabold text-white">404</p>
      <h1 className="mt-3 text-xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-sm text-slate-400">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500">
        Back to home
      </Link>
    </div>
  );
}

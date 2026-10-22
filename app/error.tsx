"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-400">An unexpected error occurred. You can try again — if it keeps happening, please contact support.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500">
        Try again
      </button>
    </div>
  );
}

import Link from "next/link";

import { AnalyzerShell } from "@/components/AnalyzerShell";
import { Nav } from "@/components/Nav";

export const metadata = {
  title: "Analyze geo-test results — GeoMatch",
};

export default function AnalyzePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">GeoMatch</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Adjust geo-test lift for imperfect matching using county-level covariates.
          Upload your test results, get Meta-CLS-style adjusted lift with confidence
          intervals.
        </p>
      </header>

      <Nav />
      <AnalyzerShell />

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Need to plan the test instead?{" "}
          <Link href="/" className="underline">
            Find matched markets →
          </Link>
        </p>
      </footer>
    </main>
  );
}

import Link from "next/link";

import { MatcherShell } from "@/components/MatcherShell";
import { Nav } from "@/components/Nav";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">GeoMatch</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Plan and analyze geo-experiments using public US-county data, with
          trajectory-aware similarity and covariate-adjusted lift estimation.
        </p>
      </header>

      <Nav />
      <MatcherShell />

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Pick an industry, pick a target county, adjust weights — top 25 contextually similar
          counties are computed in your browser via DuckDB-WASM. Export to CSV for input into
          your GeoLift run, then come back to{" "}
          <Link href="/analyze" className="underline">
            Analyze results
          </Link>{" "}
          when the test is complete.
        </p>
        <p className="mt-2">
          Built with Claude Code · GitHub CLI · Vercel · public datasets (Census · BEA · Zillow
          Research).
        </p>
      </footer>
    </main>
  );
}

import { MatcherShell } from "@/components/MatcherShell";

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">GeoMatch</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Matched markets for GeoLIFT tests — driven by public data, with trajectory-aware
          similarity (level + slope + YoY + volatility per metric).
        </p>
      </header>

      <MatcherShell />

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        <p>
          Pick an industry, pick a target county, adjust weights — top 25 contextually similar
          counties are computed in your browser via DuckDB-WASM. Export to CSV for input into
          your GeoLift run.
        </p>
        <p className="mt-2">
          Built with Claude Code · GitHub CLI · Vercel · public datasets (Census · BEA · Zillow
          Research). LAUS unemployment data lands in the next refresh.
        </p>
      </footer>
    </main>
  );
}

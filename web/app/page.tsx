export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">GeoMatch</h1>
      <p className="mt-3 text-lg text-neutral-600 dark:text-neutral-400">
        Matched markets for GeoLIFT tests — driven by public data, with trajectory-aware similarity.
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed">
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <strong>Status:</strong> pre-MVP scaffold. ETL pipeline writes a feature matrix; the
          matcher UI lands next.
        </p>

        <h2 className="pt-4 text-xl font-semibold">What this is</h2>
        <p>
          A free tool to find test/control county pairs for GeoLIFT experiments. Most existing
          tools match on KPI time series alone. GeoMatch adds contextual similarity — demographics,
          income, education, housing, employment — and how each metric is{" "}
          <em>trending</em>, so resulting pairs hold up to face-validity scrutiny.
        </p>

        <h2 className="pt-4 text-xl font-semibold">Roadmap</h2>
        <ul className="list-disc pl-6">
          <li>Phase 1 — county-level, 4 sources (ACS, LAUS, BEA, Zillow), 3 industries</li>
          <li>Phase 2 — crime, health, broadband; trajectory + seasonality features; map view</li>
          <li>Phase 3 — synthetic-control output, GeoLift R-package export</li>
        </ul>
      </section>

      <footer className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800">
        Built with Claude Code · GitHub CLI · Vercel · public datasets (Census · BLS · BEA ·
        Zillow Research).
      </footer>
    </main>
  );
}

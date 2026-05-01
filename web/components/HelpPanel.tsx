"use client";

import { useState } from "react";

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="mt-6 rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100">
        How to read these results
      </summary>
      <div className="space-y-4 px-4 pb-4 text-sm text-neutral-700 dark:text-neutral-300">
        <section>
          <h3 className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
            What &ldquo;Distance&rdquo; means
          </h3>
          <p>
            Weighted Euclidean distance in z-scored feature space — i.e., how many
            standard deviations away the candidate is from your target, summed across
            the metrics you care about. Lower is closer.
          </p>
          <ul className="mt-2 space-y-0.5 text-xs">
            <li>
              <span className="inline-block w-24 font-mono">&lt; 0.3</span>{" "}
              Excellent — likely indistinguishable
            </li>
            <li>
              <span className="inline-block w-24 font-mono">0.3 – 0.6</span>{" "}
              Good — small differences, defensible match
            </li>
            <li>
              <span className="inline-block w-24 font-mono">0.6 – 1.0</span>{" "}
              Moderate — check the contributors column
            </li>
            <li>
              <span className="inline-block w-24 font-mono">&gt; 1.0</span>{" "}
              Weak — widen the population band or reweight
            </li>
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            These cutoffs are heuristics — what matters more is the spread within
            your top 25. If they&apos;re all clustered together, your population band
            is too tight.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
            How weights work
          </h3>
          <p>
            Each slider is that metric&apos;s share of total importance. The sum is
            auto-normalized to 100% at match time, so you don&apos;t have to balance
            them manually.
          </p>
          <p className="mt-2">
            Behind the scenes, each base-metric weight is split across its derived
            features: <span className="font-mono text-xs">50% level · 20% slope · 20% YoY · 10% volatility</span>.
            That means turning up &ldquo;Education&rdquo; matches counties that not only have
            similar education levels but are also <em>trending similarly</em>.
          </p>
          <p className="mt-2 text-xs">
            <strong>Practical tip:</strong> start with the industry preset, then pull
            up the 1–2 metrics that matter most for your specific product, and drop
            the rest. The top-25 list re-ranks live.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
            &ldquo;Top contributors&rdquo;
          </h3>
          <p>
            The metrics that contributed most to the candidate&apos;s distance from
            your target. A short list here means the candidate is close on most
            features and only a few drove the gap. Use this to sanity-check whether
            the match makes sense for your specific test.
          </p>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
            What to do with the export
          </h3>
          <p>
            CSV gives you ranked candidate FIPS + names. Pick a control county (or a
            small set), then run your KPI time-series check in Meta&apos;s GeoLift
            R-package or your own synthetic-control tool — GeoMatch is for the
            contextual pre-screen, not the statistical match.
          </p>
        </section>
      </div>
    </details>
  );
}

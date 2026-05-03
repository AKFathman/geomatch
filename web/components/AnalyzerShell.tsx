"use client";

import { useEffect, useMemo, useState } from "react";

import { AnalysisResults } from "./AnalysisResults";
import { CsvUpload } from "./CsvUpload";
import { type DataBundle, loadAll } from "@/lib/data";
import { type AnalysisOutput, analyze } from "@/lib/analyze";
import type { ParsedCsv } from "@/lib/csv";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: DataBundle }
  | { status: "error"; message: string };

export function AnalyzerShell() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);

  useEffect(() => {
    loadAll()
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) =>
        setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  const output: AnalysisOutput | null = useMemo(() => {
    if (!parsed || state.status !== "ready") return null;
    try {
      return analyze(parsed.rows, state.data.features, state.data.featureNames);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [parsed, state]);

  if (state.status === "loading") {
    return (
      <div className="rounded-md border border-neutral-200 p-8 text-sm text-neutral-500 dark:border-neutral-800">
        Loading feature matrix… (about 3 MB, first load takes ~2 s)
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        Failed to load feature matrix: {state.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
          1. Upload your geo-test results
        </h2>
        <CsvUpload onParsed={setParsed} />
        {parsed && (
          <div className="mt-2 text-xs text-neutral-500">
            Parsed <strong>{parsed.rows.length}</strong> rows
            {parsed.channels.length > 0 && (
              <span> across {parsed.channels.length} channel(s): {parsed.channels.join(", ")}</span>
            )}
            .
            {parsed.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-amber-700 dark:text-amber-300">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {output && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
            2. Adjusted lift estimates
          </h2>
          <AnalysisResults output={output} />
        </section>
      )}

      <ExplainerPanel />
    </div>
  );
}

function ExplainerPanel() {
  return (
    <details className="rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100">
        How this works
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm text-neutral-700 dark:text-neutral-300">
        <p>
          Geo-tests rarely have perfectly matched test/control cells. If your test
          cells skew toward higher-income or denser counties, your raw lift estimate
          mixes up <em>treatment effect</em> with <em>baseline differences</em>. The
          adjusted and doubly-robust estimates isolate the treatment effect using
          regression on contextual covariates (income, education, age, household
          size, housing, rent, etc. — z-scored across all US counties).
        </p>
        <p>
          <strong>Three estimates per channel:</strong>{" "}
          <em>Naive</em> is the raw test−control comparison.{" "}
          <em>Adjusted</em> is a single ridge regression{" "}
          <span className="font-mono text-xs">y ~ treatment + features</span> with
          HC1-corrected sandwich standard errors. <em>Doubly-robust (DR)</em> is the
          AIPW estimator: separate outcome models per arm + a propensity model for
          treatment assignment, combined so the result is consistent if{" "}
          <em>either</em> the outcome OR propensity model is correctly specified.
        </p>
        <p>
          <strong>Which to trust:</strong> when adjusted and DR agree, you&apos;re
          on solid ground. When they disagree, DR is generally the more robust
          choice — that&apos;s the case the doubly-robust property protects
          against. The <em>DR diagnostics</em> panel inside each card shows
          propensity-score overlap and per-arm outcome model R²; heavy trimming
          or low propensity R² warn you when DR is straining.
        </p>
        <p>
          <strong>Selection diagnostic:</strong> the table inside each channel card
          shows where your test &amp; control cells differ on covariates. Big Δs
          mean the regression had real work to do — that&apos;s where your raw
          number was misleading.
        </p>
        <p>
          <strong>What this is not:</strong> Difference-in-differences with a pre-period (Phase
          2C). And it can&apos;t correct for unobserved confounders — if test cells
          got more competitive pressure during the test that we can&apos;t see, no
          adjustment fixes that.
        </p>
      </div>
    </details>
  );
}

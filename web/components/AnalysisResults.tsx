"use client";

import type { AnalysisOutput, ChannelResult } from "@/lib/analyze";
import { METRIC_LABELS } from "@/lib/presets";

function EstCard({
  label,
  pct: pctVal,
  p: pVal,
  ciLow,
  ciHigh,
  highlighted,
}: {
  label: string;
  pct: number;
  p: number;
  ciLow: number;
  ciHigh: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 ${
        highlighted
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950"
          : "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg font-semibold">{pct(pctVal)}</div>
      {Number.isFinite(ciLow) && Number.isFinite(ciHigh) ? (
        <div className="font-mono text-[11px] text-neutral-500">
          [{pct(ciLow)}, {pct(ciHigh)}]
        </div>
      ) : (
        <div className="text-[11px] text-neutral-400">no CI</div>
      )}
      <div className="font-mono text-[11px] text-neutral-500">{pCell(pVal)}</div>
    </div>
  );
}

function DrDiagnostics({
  dx,
  n,
}: {
  dx: NonNullable<ChannelResult["drDiagnostics"]>;
  n: number;
}) {
  return (
    <details className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
      <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
        Doubly-robust diagnostics — propensity overlap and outcome-model fit
      </summary>
      <div className="space-y-2 px-3 pb-3 text-xs text-neutral-700 dark:text-neutral-300">
        <p>
          DR is consistent if EITHER the propensity model OR the outcome model is
          correctly specified — but it relies on adequate{" "}
          <em>overlap</em> between test and control covariates. The diagnostics
          below tell you whether overlap held up.
        </p>
        <table className="w-full text-xs">
          <tbody>
            <tr className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3 text-neutral-500">Propensity range</td>
              <td className="py-1 font-mono">
                [{dx.minPropensity.toFixed(3)}, {dx.maxPropensity.toFixed(3)}], mean{" "}
                {dx.meanPropensity.toFixed(3)}
              </td>
            </tr>
            <tr className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3 text-neutral-500">Trimmed</td>
              <td className="py-1 font-mono">
                {dx.nTrimmed} of {n}{" "}
                {dx.nTrimmed > n * 0.2 ? (
                  <span className="ml-1 text-amber-600">⚠ poor overlap</span>
                ) : null}
              </td>
            </tr>
            <tr className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3 text-neutral-500">Outcome model R² (control)</td>
              <td className="py-1 font-mono">
                {Math.max(0, dx.outcomeR2Control).toFixed(3)}
              </td>
            </tr>
            <tr className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1 pr-3 text-neutral-500">Outcome model R² (test)</td>
              <td className="py-1 font-mono">
                {Math.max(0, dx.outcomeR2Treated).toFixed(3)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] text-neutral-500">
          High propensity R² + heavy trimming = test/control are very different on
          covariates and the IPW correction is straining. High outcome R² on both
          arms = the outcome model is doing real work, so the regression-only
          (Adjusted) estimate is also reliable.
        </p>
      </div>
    </details>
  );
}

function pct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  const sign = x >= 0 ? "+" : "";
  return `${sign}${(x * 100).toFixed(1)}%`;
}

function pCell(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}

function significanceLabel(p: number): {
  text: string;
  className: string;
} {
  if (!Number.isFinite(p)) return { text: "—", className: "text-neutral-400" };
  if (p < 0.01) return { text: "Highly significant", className: "text-emerald-700 dark:text-emerald-300" };
  if (p < 0.05) return { text: "Significant", className: "text-emerald-600 dark:text-emerald-400" };
  if (p < 0.1) return { text: "Marginal", className: "text-amber-600 dark:text-amber-400" };
  return { text: "Not significant", className: "text-rose-600 dark:text-rose-400" };
}

function ChannelCard({ result }: { result: ChannelResult }) {
  const naivePct = result.naiveRelLift;
  const adjPct = result.adjRelLift;
  const drPct = result.drRelLift;
  const drAvailable = Number.isFinite(drPct);

  // The "headline" estimate is DR if available, else Adjusted, else Naive.
  const headlinePct = drAvailable ? drPct : Number.isFinite(adjPct) ? adjPct : naivePct;
  const headlineLow = drAvailable
    ? result.drRelLiftCi95[0]
    : Number.isFinite(adjPct)
    ? result.adjRelLiftCi95[0]
    : NaN;
  const headlineHigh = drAvailable
    ? result.drRelLiftCi95[1]
    : Number.isFinite(adjPct)
    ? result.adjRelLiftCi95[1]
    : NaN;
  const headlineP = drAvailable
    ? result.drP
    : Number.isFinite(adjPct)
    ? result.adjP
    : result.naiveP;
  const headlineLabel = drAvailable
    ? "doubly-robust lift"
    : Number.isFinite(adjPct)
    ? "adjusted lift"
    : "naive lift";
  const sig = significanceLabel(headlineP);

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-300">
          {result.channel ? `Channel: ${result.channel}` : "Pooled (all rows)"}
        </h3>
        <div className="text-xs text-neutral-500">
          n={result.n} ({result.nTest} test, {result.nControl} control)
          {result.droppedNoFeatures > 0 && (
            <span className="ml-1 text-amber-600">
              · {result.droppedNoFeatures} dropped (no feature data)
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-md bg-neutral-50 p-4 dark:bg-neutral-900">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-3xl font-semibold tracking-tight">
            {pct(headlinePct)}
          </span>
          <span className="text-sm text-neutral-500">{headlineLabel}</span>
        </div>
        <div className="mt-1 text-sm">
          <span className="font-mono text-neutral-700 dark:text-neutral-300">
            95% CI: {pct(headlineLow)} to {pct(headlineHigh)}
          </span>
          <span className="ml-3 font-mono text-neutral-500">{pCell(headlineP)}</span>
          <span className={`ml-3 text-xs ${sig.className}`}>{sig.text}</span>
        </div>
      </div>

      {/* Three-up comparison: Naive | Adjusted | DR */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <EstCard
          label="Naive (raw)"
          pct={naivePct}
          p={result.naiveP}
          ciLow={NaN}
          ciHigh={NaN}
        />
        <EstCard
          label="Adjusted (regression)"
          pct={adjPct}
          p={result.adjP}
          ciLow={result.adjRelLiftCi95[0]}
          ciHigh={result.adjRelLiftCi95[1]}
        />
        <EstCard
          label="Doubly-robust (AIPW)"
          pct={drPct}
          p={result.drP}
          ciLow={result.drRelLiftCi95[0]}
          ciHigh={result.drRelLiftCi95[1]}
          highlighted
        />
      </div>

      {/* Diagnostics row */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <div className="uppercase tracking-wide text-neutral-500">Adjustment Δ</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {(adjPct - naivePct) * 100 >= 0 ? "+" : ""}
            {((adjPct - naivePct) * 100).toFixed(1)}pp
          </div>
          <div className="text-neutral-500">naive → adjusted</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-neutral-500">DR Δ</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {drAvailable
              ? `${(drPct - adjPct) * 100 >= 0 ? "+" : ""}${((drPct - adjPct) * 100).toFixed(1)}pp`
              : "—"}
          </div>
          <div className="text-neutral-500">adjusted → DR</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-neutral-500">Outcome R²</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {Math.max(0, result.r2).toFixed(3)}
            {result.r2 < 0 && (
              <span
                className="ml-1 text-amber-600"
                title={`Raw R² = ${result.r2.toFixed(3)} — ridge over-shrunk`}
              >
                ⚠
              </span>
            )}
          </div>
          <div className="text-neutral-500">single ridge fit</div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-neutral-500">Propensity R²</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {result.drDiagnostics
              ? Math.max(0, result.drDiagnostics.propensityR2).toFixed(3)
              : "—"}
          </div>
          <div className="text-neutral-500">McFadden pseudo</div>
        </div>
      </div>

      {result.drDiagnostics && (
        <DrDiagnostics dx={result.drDiagnostics} n={result.n} />
      )}

      {result.selection.length > 0 && (
        <details className="rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
            Selection diagnostic — how test &amp; control differ on covariates
          </summary>
          <div className="px-3 pb-3">
            <p className="mb-2 text-xs text-neutral-500">
              Test cells minus control cells, in z-score units. Large absolute
              values mean your assignment was correlated with that feature —
              that&apos;s exactly what the regression adjusts for.
            </p>
            <table className="w-full text-xs">
              <thead className="text-neutral-500">
                <tr>
                  <th className="py-1 text-left">Feature</th>
                  <th className="py-1 text-right">Test mean (z)</th>
                  <th className="py-1 text-right">Control mean (z)</th>
                  <th className="py-1 text-right">Δ</th>
                  <th className="py-1 text-right">p</th>
                </tr>
              </thead>
              <tbody>
                {result.selection.map((s) => (
                  <tr
                    key={s.feature}
                    className="border-t border-neutral-200 dark:border-neutral-800"
                  >
                    <td className="py-1">{METRIC_LABELS[s.baseLabel] ?? s.baseLabel}</td>
                    <td className="py-1 text-right font-mono">{s.testMeanZ.toFixed(2)}</td>
                    <td className="py-1 text-right font-mono">
                      {s.controlMeanZ.toFixed(2)}
                    </td>
                    <td
                      className={`py-1 text-right font-mono ${
                        Math.abs(s.diff) > 0.5
                          ? "text-amber-700 dark:text-amber-300"
                          : ""
                      }`}
                    >
                      {s.diff >= 0 ? "+" : ""}
                      {s.diff.toFixed(2)}
                    </td>
                    <td className="py-1 text-right font-mono text-neutral-500">
                      {s.p < 0.001 ? "<0.001" : s.p.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {result.warnings.length > 0 && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <div className="mb-1 font-medium">Notes</div>
          <ul className="list-disc pl-4">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AnalysisResults({ output }: { output: AnalysisOutput }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Analyzed <strong>{output.matchedRows}</strong> rows out of{" "}
        <strong>{output.totalRows}</strong> uploaded
        {output.totalRows > output.matchedRows && (
          <span className="ml-1">
            ({output.totalRows - output.matchedRows} dropped — fips not found in feature
            matrix)
          </span>
        )}
        . Adjusted estimate uses ridge-regression with sandwich SEs on county-level
        covariates (income, education, age, household size, housing, rent, etc.).
      </div>
      {output.channels.map((c) => (
        <ChannelCard key={c.channel ?? "_pooled"} result={c} />
      ))}
    </div>
  );
}

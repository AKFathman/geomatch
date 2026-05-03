"use client";

import type { AnalysisOutput, ChannelResult } from "@/lib/analyze";
import { METRIC_LABELS } from "@/lib/presets";

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
  const adjPct = result.adjRelLift;
  const adjLow = result.adjRelLiftCi95[0];
  const adjHigh = result.adjRelLiftCi95[1];
  const naivePct = result.naiveRelLift;
  const adjustmentMagnitude = (adjPct - naivePct) * 100; // pp
  const sig = significanceLabel(result.adjP);

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
            {pct(adjPct)}
          </span>
          <span className="text-sm text-neutral-500">adjusted lift</span>
        </div>
        <div className="mt-1 text-sm">
          <span className="font-mono text-neutral-700 dark:text-neutral-300">
            95% CI: {pct(adjLow)} to {pct(adjHigh)}
          </span>
          <span className="ml-3 font-mono text-neutral-500">{pCell(result.adjP)}</span>
          <span className={`ml-3 text-xs ${sig.className}`}>{sig.text}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Raw / unadjusted lift
          </div>
          <div className="font-mono">{pct(naivePct)}</div>
          <div className="text-xs text-neutral-500">{pCell(result.naiveP)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">Adjustment</div>
          <div className="font-mono">
            {adjustmentMagnitude > 0 ? "+" : ""}
            {adjustmentMagnitude.toFixed(1)}pp
          </div>
          <div className="text-xs text-neutral-500">
            {/* Ridge can produce negative R² when the regression doesn't beat the
                grand mean. Clamp to 0 for display; the warning surfaces below. */}
            R² = {Math.max(0, result.r2).toFixed(3)} on covariates
            {result.r2 < 0 && (
              <span className="ml-1 text-amber-600" title={`Raw R² = ${result.r2.toFixed(3)} — ridge over-shrunk for this fit`}>
                (over-shrunk)
              </span>
            )}
          </div>
        </div>
      </div>

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

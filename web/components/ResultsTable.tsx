"use client";

import { Fragment, useMemo, useState } from "react";

import type { Geo } from "@/lib/data";
import type { MatchResult } from "@/lib/match";
import { METRIC_LABELS } from "@/lib/presets";

/** Distance buckets — keep in sync with HelpPanel cutoffs. */
function distanceBucket(d: number): "excellent" | "good" | "moderate" | "weak" {
  if (d < 0.3) return "excellent";
  if (d < 0.6) return "good";
  if (d < 1.0) return "moderate";
  return "weak";
}

const BUCKET_CLASSES: Record<ReturnType<typeof distanceBucket>, string> = {
  excellent: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  good: "bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-200",
  moderate: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  weak: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

function topContributors(contributions: Record<string, number>, k = 3): string[] {
  // Group contributions by base metric (level/slope/yoy/vol all roll up)
  const byBase = new Map<string, number>();
  for (const [feat, c] of Object.entries(contributions)) {
    const base = feat.split("__")[0];
    byBase.set(base, (byBase.get(base) ?? 0) + c);
  }
  return Array.from(byBase.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([base]) => METRIC_LABELS[base] ?? base);
}

/** Returns top N base metrics ranked by total contribution. */
function topContributorsDetailed(
  contributions: Record<string, number>,
  k: number,
): Array<{ base: string; label: string; totalContribution: number }> {
  const byBase = new Map<string, number>();
  for (const [feat, c] of Object.entries(contributions)) {
    const base = feat.split("__")[0];
    byBase.set(base, (byBase.get(base) ?? 0) + c);
  }
  return Array.from(byBase.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([base, totalContribution]) => ({
      base,
      label: METRIC_LABELS[base] ?? base,
      totalContribution,
    }));
}

function fmtZ(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}

function trendArrow(slope: number | undefined): string {
  if (slope === undefined || Number.isNaN(slope)) return "";
  if (slope > 0.001) return "↑";
  if (slope < -0.001) return "↓";
  return "→";
}

function toCsv(
  results: MatchResult[],
  geos: Map<string, Geo>,
  target: Geo | null,
): string {
  const header = ["rank", "fips", "county", "state", "population", "distance"];
  const rows = results.map((r, i) => {
    const g = geos.get(r.fips);
    return [
      i + 1,
      r.fips,
      g?.name ?? "",
      g?.state ?? "",
      g?.population ?? "",
      r.distance.toFixed(4),
    ];
  });
  const lines = [header.join(",")];
  if (target) lines.push(`# Target: ${target.name}, ${target.state} (${target.fips})`);
  for (const r of rows) lines.push(r.join(","));
  return lines.join("\n");
}

export function ResultsTable({
  results,
  geos,
  target,
  features,
}: {
  results: MatchResult[];
  geos: Map<string, Geo>;
  target: Geo | null;
  features: Map<string, Record<string, number>>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const downloadHref = useMemo(() => {
    if (!results.length) return null;
    const csv = toCsv(results, geos, target);
    return URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  }, [results, geos, target]);

  if (!results.length) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
        Pick a target market to see matches.
      </div>
    );
  }

  const targetVec = target ? features.get(target.fips) : undefined;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Top {results.length} matches
          {target && (
            <span className="ml-2 font-normal text-neutral-500">
              for {target.name}, {target.state}
            </span>
          )}
        </h2>
        {downloadHref && (
          <a
            href={downloadHref}
            download={
              target
                ? `geomatch_${target.fips}_${target.name.replace(/[^A-Za-z]/g, "")}.csv`
                : "geomatch_results.csv"
            }
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            Export CSV
          </a>
        )}
      </div>
      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">County</th>
              <th className="px-3 py-2 text-right">Population</th>
              <th className="px-3 py-2 text-right">Distance</th>
              <th className="px-3 py-2 text-left">Top contributors</th>
              <th className="w-6 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const g = geos.get(r.fips);
              const isOpen = expanded === r.fips;
              const candidateVec = features.get(r.fips);
              const bucket = distanceBucket(r.distance);
              return (
                <Fragment key={r.fips}>
                  <tr
                    className="cursor-pointer border-t border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                    onClick={() => setExpanded(isOpen ? null : r.fips)}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{g?.name ?? r.fips}</div>
                      <div className="text-xs text-neutral-500">{g?.state ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {g?.population?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        title={`${bucket} match — ${r.distance.toFixed(3)} std-dev-equivalents away`}
                        className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs ${BUCKET_CLASSES[bucket]}`}
                      >
                        {r.distance.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
                      {topContributors(r.contributions).join(" · ")}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-neutral-400">
                      {isOpen ? "▾" : "▸"}
                    </td>
                  </tr>
                  {isOpen && targetVec && candidateVec && (
                    <tr className="border-t border-neutral-200 bg-neutral-50/50 dark:border-neutral-800 dark:bg-neutral-900/50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                          Why this match — top 5 contributing metrics
                        </div>
                        <div className="overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                          <table className="w-full text-xs">
                            <thead className="bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
                              <tr>
                                <th className="px-3 py-1.5 text-left">Metric</th>
                                <th className="px-3 py-1.5 text-right">
                                  {target?.name ?? "Target"} (z)
                                </th>
                                <th className="px-3 py-1.5 text-center">Trend</th>
                                <th className="px-3 py-1.5 text-right">
                                  {g?.name ?? "Candidate"} (z)
                                </th>
                                <th className="px-3 py-1.5 text-center">Trend</th>
                                <th className="px-3 py-1.5 text-right">Δ level</th>
                              </tr>
                            </thead>
                            <tbody>
                              {topContributorsDetailed(r.contributions, 5).map(
                                ({ base, label }) => {
                                  const tLevel = targetVec[`${base}__level`];
                                  const cLevel = candidateVec[`${base}__level`];
                                  const tSlope = targetVec[`${base}__slope`];
                                  const cSlope = candidateVec[`${base}__slope`];
                                  const delta =
                                    tLevel !== undefined && cLevel !== undefined
                                      ? Math.abs(tLevel - cLevel)
                                      : undefined;
                                  return (
                                    <tr
                                      key={base}
                                      className="border-t border-neutral-100 dark:border-neutral-800"
                                    >
                                      <td className="px-3 py-1.5 text-neutral-700 dark:text-neutral-300">
                                        {label}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono">
                                        {fmtZ(tLevel)}
                                      </td>
                                      <td className="px-3 py-1.5 text-center font-mono text-neutral-500">
                                        {trendArrow(tSlope)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono">
                                        {fmtZ(cLevel)}
                                      </td>
                                      <td className="px-3 py-1.5 text-center font-mono text-neutral-500">
                                        {trendArrow(cSlope)}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-mono text-neutral-600 dark:text-neutral-400">
                                        {delta !== undefined ? delta.toFixed(2) : "—"}
                                      </td>
                                    </tr>
                                  );
                                },
                              )}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-2 text-xs text-neutral-500">
                          Values are z-scores (standard deviations from the national mean).
                          Trend arrows show 3-year slope direction. Smaller Δ = closer match
                          on that metric.
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

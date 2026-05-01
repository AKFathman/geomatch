"use client";

import { useMemo, useState } from "react";

import type { Geo } from "@/lib/data";
import type { MatchResult } from "@/lib/match";
import { METRIC_LABELS } from "@/lib/presets";

function topContributors(contributions: Record<string, number>, k = 3): string[] {
  const entries = Object.entries(contributions).sort((a, b) => b[1] - a[1]);
  // Group by base metric, keep top K
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [feat] of entries) {
    const base = feat.split("__")[0];
    if (seen.has(base)) continue;
    seen.add(base);
    out.push(METRIC_LABELS[base] ?? base);
    if (out.length >= k) break;
  }
  return out;
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
}: {
  results: MatchResult[];
  geos: Map<string, Geo>;
  target: Geo | null;
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
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => {
              const g = geos.get(r.fips);
              const isOpen = expanded === r.fips;
              return (
                <tr
                  key={r.fips}
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
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.distance.toFixed(3)}
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
                    {topContributors(r.contributions).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

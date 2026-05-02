/**
 * CSV parsing + schema validation for the lift analyzer.
 *
 * Required columns: fips, group, outcome
 * Optional:         period, channel, exposures
 *
 * `group` must be one of: test, control (case-insensitive)
 * `fips` is normalized to 5-digit zero-padded string.
 *
 * Multiple rows per fips (e.g., multiple periods or channels) are aggregated
 * by SUMMING outcome (and exposures, if present) per fips per channel. This
 * matches the typical "lift over the test window" interpretation. Pre/post
 * decomposition is a Phase 2C feature.
 */

import Papa from "papaparse";

export interface RawRow {
  fips: string;
  group: "test" | "control";
  outcome: number;
  exposures?: number;
  channel?: string;
  period?: string;
}

export interface ParsedCsv {
  rows: RawRow[];
  channels: string[]; // unique channels found, sorted; empty if no channel column
  warnings: string[];
}

export interface CsvError {
  message: string;
  detail?: string;
}

const REQUIRED = ["fips", "group", "outcome"] as const;
const OPTIONAL = ["period", "channel", "exposures"] as const;

export function parseCsv(text: string): { ok: true; data: ParsedCsv } | { ok: false; error: CsvError } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors?.length) {
    return {
      ok: false,
      error: {
        message: "CSV parse error",
        detail: result.errors.slice(0, 3).map((e) => e.message).join("; "),
      },
    };
  }

  const fields = result.meta.fields ?? [];
  const missing = REQUIRED.filter((c) => !fields.includes(c));
  if (missing.length) {
    return {
      ok: false,
      error: {
        message: `Missing required columns: ${missing.join(", ")}`,
        detail: `Found columns: ${fields.join(", ")}. Required: ${REQUIRED.join(", ")}; optional: ${OPTIONAL.join(", ")}.`,
      },
    };
  }

  const warnings: string[] = [];
  const rows: RawRow[] = [];
  let badGroup = 0;
  let badOutcome = 0;

  for (const r of result.data) {
    const fipsRaw = (r.fips ?? "").trim();
    if (!fipsRaw) continue;
    const fips = fipsRaw.padStart(5, "0").slice(-5);

    const groupRaw = (r.group ?? "").trim().toLowerCase();
    let group: "test" | "control";
    if (groupRaw === "test" || groupRaw === "treatment" || groupRaw === "treated" || groupRaw === "1") {
      group = "test";
    } else if (groupRaw === "control" || groupRaw === "holdout" || groupRaw === "0") {
      group = "control";
    } else {
      badGroup++;
      continue;
    }

    const outcome = Number(r.outcome);
    if (!Number.isFinite(outcome)) {
      badOutcome++;
      continue;
    }

    const exp = r.exposures !== undefined && r.exposures !== "" ? Number(r.exposures) : undefined;
    const channel = (r.channel ?? "").trim() || undefined;
    const period = (r.period ?? "").trim() || undefined;

    rows.push({
      fips,
      group,
      outcome,
      exposures: exp !== undefined && Number.isFinite(exp) ? exp : undefined,
      channel,
      period,
    });
  }

  if (badGroup) warnings.push(`Skipped ${badGroup} rows with unrecognized 'group' value (expected: test/control)`);
  if (badOutcome) warnings.push(`Skipped ${badOutcome} rows with non-numeric 'outcome'`);
  if (!rows.length) {
    return { ok: false, error: { message: "No valid rows found after parsing", detail: warnings.join("; ") } };
  }

  // Aggregate: sum outcome (and exposures) per (fips, channel)
  const aggMap = new Map<string, RawRow>();
  for (const r of rows) {
    const key = `${r.fips}|${r.channel ?? ""}`;
    const existing = aggMap.get(key);
    if (existing) {
      // Conflicting group within same fips+channel — keep first, warn
      if (existing.group !== r.group) {
        warnings.push(
          `Conflicting group assignment for fips ${r.fips} (channel ${r.channel ?? "—"}); keeping '${existing.group}'`,
        );
      }
      existing.outcome += r.outcome;
      if (r.exposures != null && existing.exposures != null) existing.exposures += r.exposures;
    } else {
      aggMap.set(key, { ...r });
    }
  }
  const aggRows = Array.from(aggMap.values());

  const channelSet = new Set<string>();
  for (const r of aggRows) if (r.channel) channelSet.add(r.channel);
  const channels = Array.from(channelSet).sort();

  return { ok: true, data: { rows: aggRows, channels, warnings } };
}

/** A small example CSV to download as a starting point. */
export const TEMPLATE_CSV = `fips,group,period,channel,outcome,exposures
06037,test,2026-03,meta,1234,150000
06037,test,2026-03,tiktok,567,80000
17031,test,2026-03,meta,1100,148000
17031,test,2026-03,tiktok,520,75000
04013,test,2026-03,meta,890,120000
04013,test,2026-03,tiktok,410,65000
48201,control,2026-03,meta,1080,145000
48201,control,2026-03,tiktok,490,72000
36061,control,2026-03,meta,1020,142000
36061,control,2026-03,tiktok,470,70000
12086,control,2026-03,meta,860,118000
12086,control,2026-03,tiktok,395,63000
# fips: 5-digit county FIPS (Los Angeles 06037, Cook 17031, Maricopa 04013, Harris 48201, NY 36061, Miami-Dade 12086)
# group: test or control (treatment/holdout/1/0 also accepted)
# outcome: count of conversions/installs/etc (will be summed across rows with same fips+channel)
# exposures: optional impressions/spend; if provided, the analyzer uses outcome/exposures as the rate
# channel: optional; analyzer fits one model per channel (or pooled if absent)
# period: optional; for now all rows are aggregated
`;

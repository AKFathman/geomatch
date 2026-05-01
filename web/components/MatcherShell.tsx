"use client";

import { useEffect, useMemo, useState } from "react";

import { IndustryPicker } from "./IndustryPicker";
import { ResultsTable } from "./ResultsTable";
import { TargetPicker } from "./TargetPicker";
import { WeightSliders } from "./WeightSliders";
import { type DataBundle, expandWeights, loadAll } from "@/lib/data";
import { findMatches } from "@/lib/match";
import { PRESETS, presetById } from "@/lib/presets";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: DataBundle }
  | { status: "error"; message: string };

export function MatcherShell() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  useEffect(() => {
    setState({ status: "loading" });
    loadAll()
      .then((data) => setState({ status: "ready", data }))
      .catch((e: unknown) =>
        setState({ status: "error", message: e instanceof Error ? e.message : String(e) }),
      );
  }, []);

  if (state.status === "idle" || state.status === "loading") {
    return (
      <div className="rounded-md border border-neutral-200 p-8 text-sm text-neutral-500 dark:border-neutral-800">
        Loading feature matrix… (about 3 MB, first load takes ~2 s)
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
        Failed to load data: {state.message}
      </div>
    );
  }
  return <Matcher data={state.data} />;
}

function Matcher({ data }: { data: DataBundle }) {
  const [industryId, setIndustryId] = useState<string>(PRESETS[0].id);
  const [target, setTarget] = useState<string | null>(null);
  const preset = presetById(industryId)!;
  const [weights, setWeights] = useState<Record<string, number>>(preset.weights);
  const [popPct, setPopPct] = useState<number>(50); // ±%

  // When industry changes, reset weights to its preset
  useEffect(() => {
    setWeights(presetById(industryId)!.weights);
  }, [industryId]);

  const targetGeo = target ? data.geos.get(target) ?? null : null;

  const results = useMemo(() => {
    if (!target) return [];
    // Renormalize whatever the user has dialed in so weights sum to 1
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const norm: Record<string, number> = {};
    if (total > 0) {
      for (const k of Object.keys(weights)) norm[k] = weights[k] / total;
    }
    const expanded = expandWeights(norm, data.featureNames);
    const popBand: [number, number] = [
      Math.max(0, 1 - popPct / 100),
      1 + popPct / 100,
    ];
    return findMatches(
      data.features,
      data.populations,
      target,
      expanded,
      { popBand },
      25,
    );
  }, [target, weights, popPct, data]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px,1fr]">
      <aside className="space-y-5">
        <IndustryPicker value={industryId} onChange={setIndustryId} />
        <TargetPicker geos={data.geos} value={target} onChange={setTarget} />

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-neutral-500">
              Population band
            </span>
            <span className="font-mono text-neutral-500">±{popPct}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={300}
            step={5}
            value={popPct}
            onChange={(e) => setPopPct(Number(e.target.value))}
            className="w-full accent-neutral-900 dark:accent-neutral-100"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Restrict candidates to within this fraction of the target&apos;s population.
          </p>
        </div>

        <WeightSliders
          weights={weights}
          onChange={setWeights}
          onReset={() => setWeights(presetById(industryId)!.weights)}
        />

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          <div>
            Data: <strong>{data.manifest.rows.toLocaleString()}</strong> counties ·{" "}
            <strong>{data.manifest.features}</strong> features
          </div>
          <div>Sources: {data.manifest.sources.join(", ")}</div>
          <div className="mt-1 text-neutral-500">
            Built {new Date(data.manifest.built_at).toLocaleString()}
          </div>
        </div>
      </aside>

      <main>
        <ResultsTable results={results} geos={data.geos} target={targetGeo} />
      </main>
    </div>
  );
}

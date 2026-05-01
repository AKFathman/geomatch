"use client";

import { METRIC_LABELS } from "@/lib/presets";

export function WeightSliders({
  weights,
  onChange,
  onReset,
}: {
  weights: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  onReset: () => void;
}) {
  const keys = Object.keys(weights);
  const total = keys.reduce((a, k) => a + weights[k], 0);

  function setOne(key: string, value: number) {
    onChange({ ...weights, [key]: value });
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Weights
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Reset to preset
        </button>
      </div>
      <div className="space-y-2">
        {keys.map((k) => (
          <div key={k}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-700 dark:text-neutral-300">
                {METRIC_LABELS[k] ?? k}
              </span>
              <span className="font-mono text-neutral-500">
                {(weights[k] * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={weights[k]}
              onChange={(e) => setOne(k, Number(e.target.value))}
              className="w-full accent-neutral-900 dark:accent-neutral-100"
            />
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-neutral-500">
        Total: <span className="font-mono">{(total * 100).toFixed(0)}%</span>{" "}
        {Math.abs(total - 1) > 0.01 && (
          <span className="text-amber-600">
            (auto-normalized at match time)
          </span>
        )}
      </div>
    </div>
  );
}

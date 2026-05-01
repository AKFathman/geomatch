"use client";

import { useMemo, useState } from "react";

import type { Geo } from "@/lib/data";

export function TargetPicker({
  geos,
  value,
  onChange,
}: {
  geos: Map<string, Geo>;
  value: string | null;
  onChange: (fips: string) => void;
}) {
  const [query, setQuery] = useState("");

  // Sort geos by population desc so "Los Angeles County" beats tiny counties
  // when the user types "los"
  const sorted = useMemo(
    () =>
      Array.from(geos.values()).sort(
        (a, b) => (b.population ?? 0) - (a.population ?? 0),
      ),
    [geos],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted.slice(0, 25);
    return sorted
      .filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.state.toLowerCase().includes(q) ||
          `${g.name}, ${g.state}`.toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [query, sorted]);

  const selected = value ? geos.get(value) : null;

  return (
    <div>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-500">
        Target market
      </span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={selected ? `${selected.name}, ${selected.state}` : "Search counties…"}
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900"
      />
      {query && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-neutral-500">No matches</div>
          ) : (
            matches.map((g) => (
              <button
                key={g.fips}
                type="button"
                onClick={() => {
                  onChange(g.fips);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span>
                  {g.name}, {g.state}
                </span>
                <span className="text-xs text-neutral-400">
                  {g.population?.toLocaleString() ?? "—"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {selected && !query && (
        <div className="mt-1 text-xs text-neutral-500">
          Selected: <strong>{selected.name}, {selected.state}</strong> · pop{" "}
          {selected.population?.toLocaleString() ?? "—"}
        </div>
      )}
    </div>
  );
}

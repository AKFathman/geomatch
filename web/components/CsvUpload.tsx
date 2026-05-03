"use client";

import { useRef, useState } from "react";

import { type ParsedCsv, TEMPLATE_CSV, parseCsv } from "@/lib/csv";

const SAMPLE_URL = "/sample/synthetic_biased_geo_test.csv";

export function CsvUpload({
  onParsed,
}: {
  onParsed: (parsed: ParsedCsv) => void;
}) {
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function processCsvText(text: string, displayName: string) {
    setError(null);
    setFilename(displayName);
    const result = parseCsv(text);
    if (!result.ok) {
      setError(result.error);
    } else {
      onParsed(result.data);
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => processCsvText(String(reader.result ?? ""), file.name);
    reader.onerror = () => setError({ message: "Failed to read file" });
    reader.readAsText(file);
  }

  async function loadSample() {
    setLoadingSample(true);
    setError(null);
    try {
      const resp = await fetch(SAMPLE_URL);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      processCsvText(text, "synthetic_biased_geo_test.csv (sample)");
    } catch (e) {
      setError({
        message: "Failed to load sample",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoadingSample(false);
    }
  }

  function downloadBlob(content: string, name: string) {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="rounded-md border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Upload a CSV with your geo-test results — or try the synthetic example below.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Choose CSV
          </button>
          <button
            type="button"
            onClick={loadSample}
            disabled={loadingSample}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            {loadingSample ? "Loading…" : "Load sample (biased synthetic)"}
          </button>
          <button
            type="button"
            onClick={() => downloadBlob(TEMPLATE_CSV, "geomatch_lift_template.csv")}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            Download blank template
          </button>
        </div>
        {filename && !error && (
          <p className="mt-3 text-xs text-neutral-500">Loaded: {filename}</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Sample: 25 test + 25 control counties, deliberately skewed (test = top-40 by pop,
          control = pop rank 41–120). True lift: <strong>+15% on meta</strong>, <strong>+3% on tiktok</strong>.{" "}
          <a
            href={SAMPLE_URL}
            download
            className="underline hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Download CSV
          </a>{" "}
          ·{" "}
          <a
            href="/sample/synthetic_biased_geo_test_truth.txt"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            See ground truth
          </a>
        </p>
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
          <div className="font-medium">{error.message}</div>
          {error.detail && <div className="mt-1 text-xs opacity-80">{error.detail}</div>}
        </div>
      )}
    </div>
  );
}

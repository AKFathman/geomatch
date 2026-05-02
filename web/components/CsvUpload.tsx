"use client";

import { useRef, useState } from "react";

import { type ParsedCsv, TEMPLATE_CSV, parseCsv } from "@/lib/csv";

export function CsvUpload({
  onParsed,
}: {
  onParsed: (parsed: ParsedCsv) => void;
}) {
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFilename(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const result = parseCsv(text);
      if (!result.ok) {
        setError(result.error);
      } else {
        onParsed(result.data);
      }
    };
    reader.onerror = () => setError({ message: "Failed to read file" });
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geomatch_lift_template.csv";
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
          Upload a CSV with your geo-test results.
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Choose CSV
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            Download template
          </button>
        </div>
        {filename && !error && (
          <p className="mt-3 text-xs text-neutral-500">Loaded: {filename}</p>
        )}
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

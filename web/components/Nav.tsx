"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Plan a test", desc: "Find matched markets" },
  { href: "/analyze", label: "Analyze results", desc: "Adjust geo-test lift for imperfect matching" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="mb-8 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active
                ? "border-neutral-900 font-medium text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900 dark:hover:border-neutral-700 dark:hover:text-neutral-100"
            }`}
            title={t.desc}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

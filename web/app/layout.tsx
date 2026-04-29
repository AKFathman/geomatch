import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoMatch — Matched markets for GeoLIFT tests",
  description:
    "Find statistically and contextually similar US counties for GeoLIFT geo-experimentation. Free, public-data-driven, trajectory-aware.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

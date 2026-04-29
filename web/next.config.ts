import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB-WASM ships .wasm assets — let Next serve them as-is
  webpack: (config) => {
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    return config;
  },
};

export default nextConfig;

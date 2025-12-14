import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Next.js/Turbopack from selecting an unrelated workspace root when
    // multiple lockfiles exist elsewhere on disk.
    root: process.cwd(),
  },
};

export default nextConfig;

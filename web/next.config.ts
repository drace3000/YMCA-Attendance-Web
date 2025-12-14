import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Next.js/Turbopack from selecting an unrelated workspace root when
    // multiple lockfiles exist elsewhere on disk.
    root: process.cwd(),
  },
  // Transpile Infragistics Ignite UI packages for proper ESM handling
  transpilePackages: [
    "igniteui-react",
    "igniteui-react-core",
    "igniteui-react-grids",
  ],
};

export default nextConfig;

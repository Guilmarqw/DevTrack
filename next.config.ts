import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json sits in the parent Desktop folder; without this
  // Turbopack walks up and warns about inferring a workspace root outside the
  // repo. Pin the root to this project.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

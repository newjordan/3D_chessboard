import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["db"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;

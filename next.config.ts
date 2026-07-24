import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Rimosso ignoreBuildErrors per assicurarci che il codice sia solido in produzione
  reactStrictMode: false,
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      '@radix-ui/react-icons',
    ],
  },
};

export default nextConfig;

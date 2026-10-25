import type { NextConfig } from "next";

const appRoot = import.meta.dirname;

const nextConfig: NextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
  async redirects() {
    // Convenience aliases — primary Clerk routes remain /sign-in and /sign-up.
    return [
      {
        source: "/login",
        destination: "/sign-in",
        permanent: false,
      },
      {
        source: "/login/:path*",
        destination: "/sign-in",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

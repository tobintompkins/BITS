import type { NextConfig } from "next";

const appRoot = import.meta.dirname;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },
  // The acceptance server runs beside the working `next dev` process.
  // Next 16 locks `.next/dev`, so the isolated process uses its own directory.
  distDir:
    process.env.BITS_E2E_ACCEPTANCE === "1" ? ".next/e2e-acceptance" : ".next",
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
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

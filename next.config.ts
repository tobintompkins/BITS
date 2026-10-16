import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next blocks dev assets for any host other than localhost. Cloud agents
  // and local browsers open the app at 127.0.0.1.
  allowedDevOrigins: ["127.0.0.1"],
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

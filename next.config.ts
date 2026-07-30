import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  async redirects() {
    return [
      {
        source: "/admin/users",
        destination: "/admin/tenants",
        permanent: true,
      },
    ]
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import { materializeSupabaseEnvironment } from "./lib/config/supabaseEnvironmentRuntime";

materializeSupabaseEnvironment({ mode: "public" });

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

const withMDX = createMDX();

export default withMDX(nextConfig);

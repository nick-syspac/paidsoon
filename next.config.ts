import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";
import { materializeSupabaseEnvironment } from "./lib/config/supabaseEnvironmentRuntime";
import { MARKETING_REDIRECTS } from "./components/marketing/marketingContent";

materializeSupabaseEnvironment({ mode: "public" });

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
  async redirects() {
    return [
      ...MARKETING_REDIRECTS.map(({ source, destination }) => ({
        source,
        destination,
        permanent: true,
      })),
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

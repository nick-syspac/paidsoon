import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.paidsoon.com.au"
  const baseUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/api/", "/auth/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}

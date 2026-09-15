import type { MetadataRoute } from "next"
import { getAllBlogPostMeta } from "@/lib/blog/content"
import { getIntegrationLandingPages } from "@/lib/integrationsCatalog"
import {
  DEFAULT_MARKETING_LAST_MODIFIED,
  PUBLIC_MARKETING_ROUTES,
  PUBLIC_MARKETING_ROUTE_LAST_MODIFIED,
} from "@/lib/marketing/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.paidsoon.com.au"
  const baseUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
  const staticRoutes = PUBLIC_MARKETING_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(
      PUBLIC_MARKETING_ROUTE_LAST_MODIFIED[route] ?? DEFAULT_MARKETING_LAST_MODIFIED,
    ),
    changeFrequency: route === "/" ? ("weekly" as const) : ("monthly" as const),
    priority: route === "/" ? 1 : 0.7,
  }))

  const integrationRoutes = getIntegrationLandingPages()
    .filter((integration) => integration.href)
    .map((integration) => ({
      url: `${baseUrl}${integration.href}`,
      lastModified: new Date("2026-09-15T00:00:00.000Z"),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }))

  const blogRoutes = getAllBlogPostMeta().map((page) => {
    return {
      url: `${baseUrl}/blog/${page.slug}`,
      lastModified: new Date(`${page.updatedAt ?? page.publishedAt}T00:00:00.000Z`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }
  })

  return [...staticRoutes, ...integrationRoutes, ...blogRoutes]
}

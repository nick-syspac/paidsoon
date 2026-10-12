import type { MetadataRoute } from "next"
import { getAllBlogPostMeta } from "@/lib/blog/content"
import { getIntegrationLandingPages } from "@/lib/integrationsCatalog"
import {
  getStaticMarketingSitemapRoutes,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing/seo"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = MARKETING_SITE_ORIGIN
  const staticRoutes = getStaticMarketingSitemapRoutes()

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

import type { Metadata, MetadataRoute } from "next"
import { CANONICAL_FEATURE_ROUTES } from "@/components/marketing/marketingContent"

export const DEFAULT_SOCIAL_IMAGE_PATH = "/social/paidsoon-og.svg"
export const MARKETING_SITE_ORIGIN = "https://www.paidsoon.com.au"

export const PUBLIC_MARKETING_ROUTES = [
  "/",
  "/platform",
  ...CANONICAL_FEATURE_ROUTES.map(({ href }) => href),
  "/pricing",
  "/integrations",
  "/about",
  "/contact",
  "/security",
  "/faq",
  "/resources",
  "/docs",
  "/blog",
  "/roadmap",
  "/privacy",
  "/terms",
  "/cookies",
  "/acceptable-use",
  "/careers",
  "/release-notes",
  "/how-it-works",
  "/features",
] as const

export const DEFAULT_MARKETING_LAST_MODIFIED = "2026-08-21T00:00:00.000Z"

export const PUBLIC_MARKETING_ROUTE_LAST_MODIFIED: Partial<
  Record<(typeof PUBLIC_MARKETING_ROUTES)[number], string>
> = {
  "/": "2026-09-15T00:00:00.000Z",
  ...Object.fromEntries(CANONICAL_FEATURE_ROUTES.map(({ href }) => [href, "2026-09-15T00:00:00.000Z"])),
  "/pricing": "2026-09-15T00:00:00.000Z",
  "/integrations": "2026-09-15T00:00:00.000Z",
  "/resources": "2026-09-15T00:00:00.000Z",
  "/blog": "2026-09-15T00:00:00.000Z",
  "/platform": "2026-09-15T00:00:00.000Z",
  "/features": "2026-09-15T00:00:00.000Z",
}

export function getStaticMarketingSitemapRoutes(): MetadataRoute.Sitemap {
  return PUBLIC_MARKETING_ROUTES.map((route) => ({
    url: `${MARKETING_SITE_ORIGIN}${route}`,
    lastModified: new Date(
      PUBLIC_MARKETING_ROUTE_LAST_MODIFIED[route] ?? DEFAULT_MARKETING_LAST_MODIFIED,
    ),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.7,
  }))
}

export const NOINDEX_ROUTE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/dashboard",
] as const

interface MarketingMetadataInput {
  title: string
  description: string
  canonicalPath: string
  imagePath?: string
  imageAlt?: string
  type?: "website" | "article"
}

interface NoIndexMetadataInput {
  title: string
  description: string
}

export function buildMarketingMetadata({
  title,
  description,
  canonicalPath,
  imagePath = DEFAULT_SOCIAL_IMAGE_PATH,
  imageAlt = title,
  type = "website",
}: MarketingMetadataInput): Metadata {
  const absoluteUrl = (path: string) => new URL(path, MARKETING_SITE_ORIGIN).toString()

  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(canonicalPath) },
    openGraph: {
      title,
      description,
      url: absoluteUrl(canonicalPath),
      type,
      images: [{ url: absoluteUrl(imagePath), alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [absoluteUrl(imagePath)],
    },
  }
}

export function buildNoIndexMetadata({
  title,
  description,
}: NoIndexMetadataInput): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  }
}
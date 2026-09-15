import type { Metadata } from "next"

export const DEFAULT_SOCIAL_IMAGE_PATH = "/social/paidsoon-og.svg"

export const PUBLIC_MARKETING_ROUTES = [
  "/",
  "/platform",
  "/invoiceguard",
  "/spendleak",
  "/costguard",
  "/cashplan",
  "/commitguard",
  "/owners-digest",
  "/tax-buffer",
  "/margin-guard",
  "/runway-guard",
  "/deposit-guard",
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
  "/accountants",
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
  "/invoiceguard": "2026-09-15T00:00:00.000Z",
  "/spendleak": "2026-09-15T00:00:00.000Z",
  "/costguard": "2026-09-15T00:00:00.000Z",
  "/cashplan": "2026-09-15T00:00:00.000Z",
  "/pricing": "2026-09-15T00:00:00.000Z",
  "/integrations": "2026-09-15T00:00:00.000Z",
  "/resources": "2026-09-15T00:00:00.000Z",
  "/blog": "2026-09-15T00:00:00.000Z",
  "/accountants": "2026-09-15T00:00:00.000Z",
  "/platform": "2026-09-15T00:00:00.000Z",
  "/features": "2026-09-15T00:00:00.000Z",
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
  type = "website",
}: MarketingMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type,
      images: [{ url: imagePath }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imagePath],
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
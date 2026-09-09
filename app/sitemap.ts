import type { MetadataRoute } from "next"

const MARKETING_ROUTES = [
  "",
  "/platform",
  "/paidsoon",
  "/spendleak",
  "/costguard",
  "/cashplan",
  "/commitguard",
  "/owners-digest",
  "/tax-buffer",
  "/margin-guard",
  "/runway-guard",
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

export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.paidsoon.com.au"
  const baseUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
  const lastModified = new Date()

  return MARKETING_ROUTES.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }))
}

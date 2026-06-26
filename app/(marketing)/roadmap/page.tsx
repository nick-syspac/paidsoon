import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Product Roadmap — PaidSoon",
  description:
    "See what's coming next for PaidSoon — upcoming features, integrations, and improvements on our product roadmap.",
}

export default function RoadmapPage() {
  return (
    <PlaceholderPage
      title="Product Roadmap"
      description="This page will contain the PaidSoon public product roadmap — upcoming features, integrations, and planned improvements. Check back soon."
    />
  )
}

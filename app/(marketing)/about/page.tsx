import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "About PaidSoon — Our Story",
  description:
    "Learn about PaidSoon — who we are, why we built it, and the team behind the product. Built by Syspac Pty Ltd.",
}

export default function AboutPage() {
  return (
    <PlaceholderPage
      title="About PaidSoon"
      description="This page will tell the story of PaidSoon, the team at Syspac Pty Ltd, and why we built a tool to help Australian businesses get paid faster."
    />
  )
}

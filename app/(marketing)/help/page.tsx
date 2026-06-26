import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Help Centre — PaidSoon",
  description:
    "PaidSoon help centre — step-by-step guides and support articles for setting up and using PaidSoon.",
}

export default function HelpPage() {
  return (
    <PlaceholderPage
      title="Help Centre"
      description="The PaidSoon help centre will contain step-by-step guides, how-to articles, and troubleshooting resources for getting the most out of PaidSoon."
    />
  )
}

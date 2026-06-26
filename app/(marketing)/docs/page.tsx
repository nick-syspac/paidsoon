import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Documentation — PaidSoon",
  description:
    "PaidSoon technical documentation — API reference, integration guides, and advanced configuration.",
}

export default function DocsPage() {
  // TODO: replace with docs platform integration
  return (
    <PlaceholderPage
      title="Documentation"
      description="Technical documentation for PaidSoon — including API reference, webhook integration guides, and advanced configuration options. Coming soon."
    />
  )
}

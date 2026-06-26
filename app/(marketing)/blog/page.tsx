import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Blog — PaidSoon",
  description:
    "Tips, guides, and insights on invoice management, cash flow, and getting paid faster from the PaidSoon team.",
}

export default function BlogPage() {
  // TODO: replace with CMS integration
  return (
    <PlaceholderPage
      title="Blog"
      description="The PaidSoon blog will feature tips on improving cash flow, managing overdue invoices, and getting the most out of automated follow-ups. Articles coming soon."
    />
  )
}

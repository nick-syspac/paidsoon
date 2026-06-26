import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Release Notes — PaidSoon",
  description:
    "PaidSoon release notes — what's new, what's changed, and what's been fixed in each release.",
}

export default function ReleaseNotesPage() {
  return (
    <PlaceholderPage
      title="Release Notes"
      description="The PaidSoon changelog — a record of new features, improvements, and bug fixes in each release. Updates coming soon."
    />
  )
}

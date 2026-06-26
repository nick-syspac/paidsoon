import type { Metadata } from "next"
import { PlaceholderPage } from "@/components/marketing/PlaceholderPage"

export const metadata: Metadata = {
  title: "Careers at PaidSoon",
  description:
    "Join the team at PaidSoon (Syspac Pty Ltd) — open roles and information about working at PaidSoon.",
}

export default function CareersPage() {
  return (
    <PlaceholderPage
      title="Careers"
      description="We're not currently advertising open roles, but we're always interested in hearing from talented people. Reach out via the contact page."
    />
  )
}

import type { Metadata } from "next"
import { buildNoIndexMetadata } from "@/lib/marketing/seo"

export const metadata: Metadata = buildNoIndexMetadata({
  title: "PaidSoon onboarding",
  description: "Complete onboarding before using your PaidSoon workspace.",
})

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
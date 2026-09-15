import type { Metadata } from "next"
import { buildNoIndexMetadata } from "@/lib/marketing/seo"

export const metadata: Metadata = buildNoIndexMetadata({
  title: "PaidSoon account access",
  description: "Sign in, sign up, and recover access to your PaidSoon account.",
})

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
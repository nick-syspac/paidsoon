"use client"

import Link from "next/link"
import { track } from "@vercel/analytics"

interface MarketingCtaLinkProps {
  href: string
  label: string
  eventName: string
  legacyEventNames?: string[]
  eventData?: Record<string, string>
  className?: string
}

export function MarketingCtaLink({
  href,
  label,
  eventName,
  legacyEventNames,
  eventData,
  className,
}: MarketingCtaLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        void track(eventName, eventData ?? {})
        if (legacyEventNames) {
          for (const alias of legacyEventNames) {
            void track(alias, eventData ?? {})
          }
        }
      }}
    >
      {label}
    </Link>
  )
}

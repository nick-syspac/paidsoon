"use client"

import Link from "next/link"
import { track } from "@vercel/analytics"

interface MarketingCtaLinkProps {
  href: string
  label: string
  eventName: string
  eventData?: Record<string, string>
  className?: string
}

export function MarketingCtaLink({
  href,
  label,
  eventName,
  eventData,
  className,
}: MarketingCtaLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        void track(eventName, eventData ?? {})
      }}
    >
      {label}
    </Link>
  )
}

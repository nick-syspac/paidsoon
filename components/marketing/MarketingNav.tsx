"use client"

import Image from "next/image"
import Link from "next/link"
import { useRef, useState } from "react"
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink"
import { getJourneyCta, MODULE_HREF, PRODUCT_LINKS, SOLUTION_GROUPS } from "@/components/marketing/marketingContent"

const MODULE_LINKS = PRODUCT_LINKS.filter((link) => Object.values(MODULE_HREF).includes(link.href))

const topLinks = [
  { label: "How it works", href: "/how-it-works" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "Security", href: "/security" },
]

export function MarketingNav({ liveMode }: { liveMode: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const solutionsMenuRef = useRef<HTMLDivElement | null>(null)
  const cta = getJourneyCta("hero", liveMode)

  return (
    <header className="border-b border-gray-100 bg-white/95 backdrop-blur sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link
          href="/"
          aria-label="PaidSoon home"
          className="shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Image
            src="/paidsoon-logo.png"
            alt="PaidSoon"
            width={1086}
            height={160}
            priority
            className="h-6 w-auto sm:h-7"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
          <div
            ref={solutionsMenuRef}
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSolutionsOpen(false)
              }
            }}
          >
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1 py-1"
              aria-haspopup="true"
              aria-expanded={solutionsOpen}
              onClick={() => setSolutionsOpen((value) => !value)}
            >
              Solutions
            </button>
            {solutionsOpen ? (
              <div className="absolute left-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                {SOLUTION_GROUPS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          {topLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth/CTA */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Login
          </Link>
          <MarketingCtaLink
            href={cta.href}
            label={cta.label}
            eventName="marketing_nav_cta_selected"
            eventData={{ liveMode: String(liveMode) }}
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
        </div>

        {/* Mobile hamburger */}
        <button
          className="lg:hidden p-2 rounded text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Toggle navigation menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          className="lg:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3"
          aria-label="Mobile navigation"
        >
          <p className="text-xs uppercase tracking-wide text-gray-400 px-1">Solutions</p>
          {SOLUTION_GROUPS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/platform"
            className="text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            onClick={() => setMobileOpen(false)}
          >
            Platform
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            onClick={() => setMobileOpen(false)}
          >
            Pricing
          </Link>
          <p className="text-xs uppercase tracking-wide text-gray-400 mt-1 px-1">Modules</p>
          {MODULE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <p className="text-xs uppercase tracking-wide text-gray-400 mt-1 px-1">Company</p>
          {topLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-700 hover:text-gray-900 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <hr className="border-gray-100" />
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 py-1"
            onClick={() => setMobileOpen(false)}
          >
            Login
          </Link>
          <MarketingCtaLink
            href={cta.href}
            label={cta.label}
            eventName="marketing_mobile_nav_cta_selected"
            eventData={{ liveMode: String(liveMode) }}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-center"
          />
        </nav>
      )}
    </header>
  )
}

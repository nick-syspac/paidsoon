"use client"

import Link from "next/link"
import { useState } from "react"

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "For Accountants", href: "/accountants" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
]

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="border-b border-gray-100 bg-white sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Wordmark */}
        <Link href="/" className="font-semibold text-gray-900 text-lg">
          PaidSoon
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {navLinks.map((link) => (
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
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Log In
          </Link>
          <Link
            href="/pricing"
            className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Start Free Trial
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
          className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3"
          aria-label="Mobile navigation"
        >
          {navLinks.map((link) => (
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
            Log In
          </Link>
          <Link
            href="/pricing"
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-center"
            onClick={() => setMobileOpen(false)}
          >
            Start Free Trial
          </Link>
        </nav>
      )}
    </header>
  )
}

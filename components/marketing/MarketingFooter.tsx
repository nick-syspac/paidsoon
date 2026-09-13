import Link from "next/link"
import { MARKETING_CTA_BY_STAGE, PRODUCT_LINKS } from "@/components/marketing/marketingContent"

const footerLinks = {
  Company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Careers", href: "/careers" },
  ],
  Product: PRODUCT_LINKS.map((link) =>
    link.href === "/paidsoon"
      ? { label: "InvoiceGuard", href: "/invoiceguard" }
      : { label: link.label, href: link.href },
  ),
  Support: [
    { label: "Help Centre", href: "/help" },
    { label: "FAQ", href: "/faq" },
    { label: "Security", href: "/security" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Documentation", href: "/docs" },
    { label: "Release Notes", href: "/release-notes" },
    { label: "Roadmap", href: "/roadmap" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
    { label: "Security", href: "/security" },
    { label: "Acceptable Use", href: "/acceptable-use" },
  ],
}

export function MarketingFooter() {
  const abn = process.env.NEXT_PUBLIC_COMPANY_ABN
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-gray-100 bg-gray-50 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="mb-8 rounded-xl border border-blue-100 bg-blue-50 p-5 text-center">
          <p className="text-sm text-blue-900">Start with the financial problem that matters most.</p>
          <Link
            href="/contact"
            className="mt-3 inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            {MARKETING_CTA_BY_STAGE.footer}
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {group}
              </h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-gray-600 hover:text-gray-900"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Trust */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Trust
            </h3>
            <div className="space-y-2 text-sm text-gray-500">
              <p className="font-medium text-gray-700">Syspac Pty Ltd</p>
              <p>
                {abn
                  ? `ABN: ${abn}`
                  : "ABN: 12 657 226 125"}
              </p>
              <address className="not-italic">
                Level 4
                <br />
                152 Elizabeth Street
                <br />
                Melbourne. VIC. 3000
              </address>
              <p>Australian owned and operated</p>
              <p>No lock-in contracts</p>
              <a
                href="https://www.linkedin.com/company/syspac"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:text-gray-900"
              >
                LinkedIn ↗
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
          © {year} Syspac Pty Ltd. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

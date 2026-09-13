"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/resolved", label: "Resolved Invoices" },
  { href: "/dashboard/deposit-guard", label: "DepositGuard" },
  { href: "/dashboard/owners-digest", label: "Owner's Digest" },
  { href: "/dashboard/commitguard", label: "CommitGuard" },
  { href: "/dashboard/cost-guard", label: "Cost Guard" },
  { href: "/dashboard/margin-guard", label: "MarginGuard" },
  { href: "/dashboard/runway-guard", label: "RunwayGuard" },
]

export function DashboardNavRail({
  canViewDepositGuard,
  canViewOwnersDigest,
  canViewCommitGuard,
  canViewSpendLeak,
  canViewTaxBuffer,
  canViewMarginGuard,
  canViewRunwayGuard,
}: {
  canViewDepositGuard: boolean
  canViewOwnersDigest: boolean
  canViewCommitGuard: boolean
  canViewSpendLeak: boolean
  canViewTaxBuffer: boolean
  canViewMarginGuard: boolean
  canViewRunwayGuard: boolean
}) {
  const pathname = usePathname()
  const tabs = [
    ...TABS.filter((tab) => {
      if (tab.href === "/dashboard/deposit-guard") return canViewDepositGuard
      if (tab.href === "/dashboard/owners-digest") return canViewOwnersDigest
      if (tab.href === "/dashboard/commitguard") return canViewCommitGuard
      if (tab.href === "/dashboard/margin-guard") return canViewMarginGuard
      if (tab.href === "/dashboard/runway-guard") return canViewRunwayGuard
      return true
    }),
    ...(canViewTaxBuffer ? [{ href: "/dashboard/tax-buffer", label: "Tax Buffer" }] : []),
    ...(canViewSpendLeak ? [{ href: "/dashboard/spendleak", label: "SpendLeak" }] : []),
  ]

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-gray-200 pb-2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-4"
    >
      {tabs.map((tab) => {
        const isActive = tab.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

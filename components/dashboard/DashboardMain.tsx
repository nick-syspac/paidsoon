"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardNavRail } from "./DashboardNavRail"

// Invoices/Resolved tables need more room to avoid horizontal scroll; other pages stay narrower.
const WIDE_ROUTES = [
  "/dashboard/invoices",
  "/dashboard/resolved",
  "/dashboard/owners-digest",
  "/dashboard/commitguard",
  "/dashboard/spendleak",
  "/dashboard/cost-guard",
  "/dashboard/tax-buffer",
  "/dashboard/margin-guard",
  "/dashboard/runway-guard",
]

export function DashboardMain({
  children,
  canViewOwnersDigest,
  canViewCommitGuard,
  canViewSpendLeak,
  canViewTaxBuffer,
  canViewMarginGuard,
  canViewRunwayGuard,
}: {
  children: React.ReactNode
  canViewOwnersDigest: boolean
  canViewCommitGuard: boolean
  canViewSpendLeak: boolean
  canViewTaxBuffer: boolean
  canViewMarginGuard: boolean
  canViewRunwayGuard: boolean
}) {
  const pathname = usePathname()
  const isWide = WIDE_ROUTES.some((route) => pathname.startsWith(route))

  return (
    <main className={cn("mx-auto px-4 py-8", isWide ? "max-w-7xl" : "max-w-5xl")}>
      <div className="flex flex-col gap-6 md:flex-row">
        <DashboardNavRail
          canViewOwnersDigest={canViewOwnersDigest}
          canViewCommitGuard={canViewCommitGuard}
          canViewSpendLeak={canViewSpendLeak}
          canViewTaxBuffer={canViewTaxBuffer}
          canViewMarginGuard={canViewMarginGuard}
          canViewRunwayGuard={canViewRunwayGuard}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  )
}

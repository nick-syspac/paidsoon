"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { DashboardNavRail } from "./DashboardNavRail"

// Invoices/Resolved tables need more room to avoid horizontal scroll; other pages stay narrower.
const WIDE_ROUTES = ["/dashboard/invoices", "/dashboard/resolved", "/dashboard/spendleak"]

export function DashboardMain({
  children,
  canViewSpendLeak,
}: {
  children: React.ReactNode
  canViewSpendLeak: boolean
}) {
  const pathname = usePathname()
  const isWide = WIDE_ROUTES.some((route) => pathname.startsWith(route))

  return (
    <main className={cn("mx-auto px-4 py-8", isWide ? "max-w-7xl" : "max-w-5xl")}>
      <div className="flex flex-col gap-6 md:flex-row">
        <DashboardNavRail canViewSpendLeak={canViewSpendLeak} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </main>
  )
}

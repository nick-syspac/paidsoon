"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const TABS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/invoices", label: "Invoices" },
  { href: "/dashboard/resolved", label: "Resolved Invoices" },
]

export function DashboardNavRail() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-gray-200 pb-2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-4"
    >
      {TABS.map((tab) => {
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

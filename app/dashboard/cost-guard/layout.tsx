import Link from "next/link"

const TABS = [
  { href: "/dashboard/cost-guard", label: "Overview" },
  { href: "/dashboard/cost-guard/alerts", label: "Alerts" },
  { href: "/dashboard/cost-guard/suppliers", label: "Suppliers" },
  { href: "/dashboard/cost-guard/categories", label: "Categories" },
  { href: "/dashboard/cost-guard/rules", label: "Rules" },
]

export default function CostGuardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cost Guard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Keep business costs under control and catch unusual spending early.
          </p>
        </div>
        <Link
          href="/dashboard/settings/cost-guard"
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cost Guard Settings
        </Link>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="border-b-2 border-transparent px-3 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div>{children}</div>
    </div>
  )
}

import Link from "next/link"

const TABS = [
  { href: "/dashboard/settings/stripe", label: "Stripe Connection" },
  { href: "/dashboard/settings/schedule", label: "Schedule" },
  { href: "/dashboard/settings/email", label: "Email" },
  { href: "/dashboard/settings/subscription", label: "Subscription" },
]

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border-b-2 border-transparent hover:border-gray-300 -mb-px"
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <div>{children}</div>
    </div>
  )
}

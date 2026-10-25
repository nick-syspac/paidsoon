"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SettingsNavGroup } from "@/lib/settings/navigation"
import { isSettingsItemActive } from "@/lib/settings/navigation"

export function SettingsNavigation({ groups }: { groups: SettingsNavGroup[] }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings navigation"
      className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-gray-200 pb-2 md:w-48 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:pb-0 md:pr-4"
    >
      <h2 className="mb-4 text-sm font-medium text-gray-700">Settings</h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              {group.label}
            </h3>
            {group.items.length === 0 ? (
              <p className="text-sm text-gray-400">No settings available</p>
            ) : (
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = isSettingsItemActive(pathname, item.href)

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={[
                          "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                        ].join(" ")}
                      >
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </nav>
  )
}

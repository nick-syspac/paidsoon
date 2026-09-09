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
      className="rounded-xl border border-gray-200 bg-white p-4 lg:sticky lg:top-6"
    >
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-gray-500">Settings</h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
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
                          "block rounded-md px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-blue-50 font-medium text-blue-700 ring-1 ring-inset ring-blue-200"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
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

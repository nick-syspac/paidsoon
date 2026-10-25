"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SettingsNavGroup } from "@/lib/settings/navigation"
import {
  findActiveSettingsGroup,
  getSettingsDiscoveryEntries,
  isSettingsItemActive,
} from "@/lib/settings/navigation"

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase()
}

export function SettingsNavigation({ groups }: { groups: SettingsNavGroup[] }) {
  const pathname = usePathname()
  const [query, setQuery] = useState("")
  const [mobileOpen, setMobileOpen] = useState(false)
  const activeGroup = findActiveSettingsGroup(pathname, groups)
  const activeGroupId = activeGroup?.id ?? null

  const initialCollapsed = useMemo(() => {
    const collapsed = new Set<string>()
    for (const group of groups) {
      const shouldCollapse = group.defaultCollapsed && group.id !== activeGroupId
      if (shouldCollapse) {
        collapsed.add(group.id)
      }
    }
    return collapsed
  }, [activeGroupId, groups])

  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(initialCollapsed)

  const discoveryEntries = useMemo(() => getSettingsDiscoveryEntries(groups), [groups])
  const filteredEntries = useMemo(() => {
    const normalized = normalizeQuery(query)
    if (!normalized) return []
    return discoveryEntries.filter((entry) => entry.terms.some((term) => term.includes(normalized)))
  }, [discoveryEntries, query])

  function toggleGroup(groupId: string): void {
    setCollapsedGroupIds((current) => {
      const next = new Set(current)
      const isExpanded = !next.has(groupId) || activeGroupId === groupId
      if (isExpanded) {
        next.add(groupId)
      } else {
        next.delete(groupId)
      }
      return next
    })
  }

  function revealGroup(groupId: string): void {
    setCollapsedGroupIds((current) => {
      if (!current.has(groupId)) return current
      const next = new Set(current)
      next.delete(groupId)
      return next
    })
    setMobileOpen(false)
  }

  return (
    <nav aria-label="Settings navigation" className="shrink-0 md:w-64 md:pr-4">
      <div className="rounded-lg border border-gray-200 bg-white p-3 md:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Settings</h2>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="settings-navigation-sections"
            className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 md:hidden"
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? "Close" : "Browse"}
          </button>
        </div>

        <div className="mt-3">
          <label htmlFor="settings-navigation-search" className="sr-only">
            Search settings
          </label>
          <input
            id="settings-navigation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a setting"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {normalizeQuery(query).length > 0 ? (
          <div className="mt-3 space-y-2" role="list" aria-label="Settings search results">
            {filteredEntries.length === 0 ? (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">No matching settings</p>
            ) : (
              filteredEntries.map((entry) => {
                const active = isSettingsItemActive(pathname, entry.href)
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={() => revealGroup(entry.groupId)}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "block rounded-md border px-3 py-2 text-sm transition-colors",
                      active
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <span className="block font-medium">{entry.label}</span>
                    <span className="block text-xs text-gray-500">{entry.groupLabel}</span>
                  </Link>
                )
              })
            )}
          </div>
        ) : (
          <div
            id="settings-navigation-sections"
            className={["mt-3 space-y-3", mobileOpen ? "block" : "hidden md:block"].join(" ")}
          >
            {groups.map((group) => {
              const isExpanded = !collapsedGroupIds.has(group.id) || activeGroupId === group.id
              return (
                <section key={group.id} className="rounded-md border border-gray-200">
                  <h3>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      aria-expanded={isExpanded}
                      aria-controls={`settings-group-${group.id}`}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">{group.label}</span>
                      <span className="text-xs text-gray-400">{isExpanded ? "Hide" : "Show"}</span>
                    </button>
                  </h3>
                  {isExpanded ? (
                    <ul id={`settings-group-${group.id}`} className="space-y-1 border-t border-gray-100 px-2 py-2">
                      {group.items.map((item) => {
                        const active = isSettingsItemActive(pathname, item.href)
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              onClick={() => setMobileOpen(false)}
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
                  ) : null}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}

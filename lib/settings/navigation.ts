export interface SettingsNavItem {
  href: string
  label: string
  group: string
  order: number
  requiresAuth?: boolean
  requiresFeature?: string
  requiresEntitlement?: string
  match?: (pathname: string, href: string) => boolean
}

export interface SettingsNavGroup {
  id: string
  label: string
  items: SettingsNavItem[]
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { href: "/dashboard/settings/account", label: "Account", group: "general", order: 1 },
  { href: "/dashboard/settings/connections", label: "Connections", group: "general", order: 2 },
  { href: "/dashboard/settings/team", label: "Team", group: "general", order: 3 },
  { href: "/dashboard/settings/subscription", label: "Subscription", group: "general", order: 4 },
  { href: "/dashboard/settings/schedule", label: "Schedule", group: "paidsoon", order: 1 },
  { href: "/dashboard/settings/email", label: "Email", group: "paidsoon", order: 2 },
  { href: "/dashboard/settings/templates", label: "Templates", group: "paidsoon", order: 3 },
  { href: "/dashboard/settings/import-export", label: "Import / Export", group: "paidsoon", order: 4 },
  { href: "/dashboard/settings/commitguard", label: "CommitGuard", group: "commitguard", order: 1 },
  { href: "/dashboard/settings/cost-guard", label: "Cost Guard", group: "costguard", order: 1 },
  { href: "/dashboard/settings/tax-buffer", label: "Tax Buffer", group: "taxbuffer", order: 1 },
  { href: "/dashboard/settings/cash-plan", label: "Forecast settings", group: "cashplan", order: 1 },
]

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  { id: "general", label: "General", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "general") },
  { id: "paidsoon", label: "PaidSoon", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "paidsoon") },
  { id: "spendleak", label: "SpendLeak", items: [] },
  { id: "commitguard", label: "CommitGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "commitguard") },
  { id: "costguard", label: "CostGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "costguard") },
  { id: "taxbuffer", label: "TaxBuffer", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "taxbuffer") },
  { id: "cashplan", label: "CashPlan", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "cashplan") },
]

export function isSettingsItemActive(currentUrl: string, href: string): boolean {
  const current = currentUrl.split("?")[0]
  const target = href.split("?")[0]

  if (current === target) return true

  const normalizedCurrent = current.replace(/\/$/, "")
  const normalizedTarget = target.replace(/\/$/, "")

  return normalizedCurrent.startsWith(`${normalizedTarget}/`)
}

export function findActiveSettingsItem(pathname: string): SettingsNavItem | undefined {
  return SETTINGS_NAV_ITEMS.find((item) => isSettingsItemActive(pathname, item.href))
}

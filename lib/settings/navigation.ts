import { hasPlanFeature } from "@/lib/subscriptionPlans"

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
  {
    href: "/dashboard/settings/deposit-guard",
    label: "DepositGuard",
    group: "depositguard",
    order: 1,
    requiresFeature: "deposit_guard_deposit_requests",
  },
  { href: "/dashboard/settings/owners-digest", label: "Owner's Digest", group: "ownersdigest", order: 1, requiresFeature: "owners_digest_core" },
  { href: "/dashboard/settings/commitguard", label: "CommitGuard", group: "commitguard", order: 1, requiresFeature: "commitguard_core" },
  { href: "/dashboard/settings/cost-guard", label: "Cost Guard", group: "costguard", order: 1, requiresFeature: "accounting_integrations" },
  { href: "/dashboard/settings/margin-guard", label: "MarginGuard", group: "marginguard", order: 1, requiresFeature: "marginguard_core" },
  { href: "/dashboard/settings/runway-guard", label: "RunwayGuard", group: "runwayguard", order: 1, requiresFeature: "runwayguard_core" },
  { href: "/dashboard/settings/tax-buffer", label: "Tax Buffer", group: "taxbuffer", order: 1, requiresFeature: "tax_buffer_basic" },
  { href: "/dashboard/settings/cash-plan", label: "Forecast settings", group: "cashplan", order: 1, requiresFeature: "accounting_integrations" },
]

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  { id: "general", label: "General", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "general") },
  { id: "paidsoon", label: "InvoiceGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "paidsoon") },
  { id: "depositguard", label: "DepositGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "depositguard") },
  { id: "spendleak", label: "SpendLeak", items: [] },
  { id: "ownersdigest", label: "Owner's Digest", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "ownersdigest") },
  { id: "commitguard", label: "CommitGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "commitguard") },
  { id: "costguard", label: "CostGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "costguard") },
  { id: "marginguard", label: "MarginGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "marginguard") },
  { id: "runwayguard", label: "RunwayGuard", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "runwayguard") },
  { id: "taxbuffer", label: "TaxBuffer", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "taxbuffer") },
  { id: "cashplan", label: "CashPlan", items: SETTINGS_NAV_ITEMS.filter((item) => item.group === "cashplan") },
]

export function getVisibleSettingsNavGroups(tier: string | null | undefined): SettingsNavGroup[] {
  return SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!item.requiresFeature) return true
      return hasPlanFeature(tier, item.requiresFeature as never)
    }),
  })).filter((group) => group.items.length > 0 || group.id === "spendleak")
}

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

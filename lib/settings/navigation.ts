import { hasPlanFeature } from "@/lib/subscriptionPlans"
import { canAccessSpendLeak } from "@/lib/dashboard/spendleakAccess"

export interface SettingsNavItem {
  href: string
  label: string
  group: string
  order: number
  searchAliases?: string[]
  searchKeywords?: string[]
  requiresAuth?: boolean
  requiresFeature?: string
  requiresEntitlement?: string
  isVisible?: (tier: string | null | undefined) => boolean
  match?: (pathname: string, href: string) => boolean
}

export interface SettingsNavGroup {
  id: string
  label: string
  order: number
  searchLabel: string
  defaultCollapsed: boolean
  items: SettingsNavItem[]
}

export interface SettingsDiscoveryEntry {
  href: string
  label: string
  groupId: string
  groupLabel: string
  terms: string[]
}

const SETTINGS_GROUP_DEFINITIONS: Omit<SettingsNavGroup, "items">[] = [
  { id: "general", label: "General", order: 1, searchLabel: "General account and subscription", defaultCollapsed: false },
  { id: "paidsoon", label: "InvoiceGuard", order: 2, searchLabel: "InvoiceGuard reminders and workflows", defaultCollapsed: false },
  { id: "depositguard", label: "DepositGuard", order: 3, searchLabel: "DepositGuard settings", defaultCollapsed: true },
  { id: "spendleak", label: "SpendLeak", order: 4, searchLabel: "SpendLeak readiness settings", defaultCollapsed: true },
  { id: "ownersdigest", label: "Owner's Digest", order: 5, searchLabel: "Owner's Digest delivery settings", defaultCollapsed: true },
  { id: "commitguard", label: "CommitGuard", order: 6, searchLabel: "CommitGuard controls", defaultCollapsed: true },
  { id: "costguard", label: "CostGuard", order: 7, searchLabel: "Cost Guard detection and alerts", defaultCollapsed: true },
  { id: "marginguard", label: "MarginGuard", order: 8, searchLabel: "MarginGuard thresholds and targets", defaultCollapsed: true },
  { id: "runwayguard", label: "RunwayGuard", order: 9, searchLabel: "RunwayGuard warning settings", defaultCollapsed: true },
  { id: "taxbuffer", label: "TaxBuffer", order: 10, searchLabel: "Tax Buffer reserve settings", defaultCollapsed: true },
  { id: "cashplan", label: "CashPlan", order: 11, searchLabel: "Cash plan forecast assumptions", defaultCollapsed: true },
]

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { href: "/settings/account", label: "Account", group: "general", order: 1, searchAliases: ["profile"], searchKeywords: ["display name", "identity"] },
  { href: "/settings/connections", label: "Connections", group: "general", order: 2, searchAliases: ["integrations", "stripe", "xero", "myob"], searchKeywords: ["oauth", "invoice sources"] },
  { href: "/settings/team", label: "Team", group: "general", order: 3, searchAliases: ["seats", "invites"], searchKeywords: ["collaboration"] },
  { href: "/settings/subscription", label: "Subscription", group: "general", order: 4, searchAliases: ["billing", "plan"], searchKeywords: ["checkout", "cancel"] },
  { href: "/settings/schedule", label: "Schedule", group: "paidsoon", order: 1, searchAliases: ["follow-up cadence"], searchKeywords: ["reminders", "days overdue"] },
  { href: "/settings/email", label: "Email", group: "paidsoon", order: 2, searchAliases: ["sender", "reply-to"], searchKeywords: ["from address", "resend"] },
  { href: "/settings/templates", label: "Templates", group: "paidsoon", order: 3, searchAliases: ["email template"], searchKeywords: ["subject", "body", "ai rewrite"] },
  { href: "/settings/import-export", label: "Import / Export", group: "paidsoon", order: 4, searchAliases: ["import", "export"], searchKeywords: ["invoice import", "invoice export", "spend import"] },
  {
    href: "/settings/deposit-guard",
    label: "DepositGuard",
    group: "depositguard",
    order: 1,
    searchAliases: ["deposit"],
    searchKeywords: ["payment request", "milestones"],
    requiresFeature: "deposit_guard_deposit_requests",
  },
  {
    href: "/settings/spendleak",
    label: "SpendLeak",
    group: "spendleak",
    order: 1,
    searchAliases: ["spend leak"],
    searchKeywords: ["source coverage", "readiness"],
    isVisible: canAccessSpendLeak,
  },
  { href: "/settings/owners-digest", label: "Owner's Digest", group: "ownersdigest", order: 1, searchAliases: ["digest"], searchKeywords: ["email cadence"], requiresFeature: "owners_digest_core" },
  { href: "/settings/commitguard", label: "CommitGuard", group: "commitguard", order: 1, searchAliases: ["commitments"], searchKeywords: ["renewal", "horizon", "alerts"], requiresFeature: "commitguard_core" },
  { href: "/settings/cost-guard", label: "Cost Guard", group: "costguard", order: 1, searchAliases: ["costguard"], searchKeywords: ["materiality", "digest mode"], requiresFeature: "accounting_integrations" },
  { href: "/settings/margin-guard", label: "MarginGuard", group: "marginguard", order: 1, searchAliases: ["margin"], searchKeywords: ["target", "threshold"], requiresFeature: "marginguard_core" },
  { href: "/settings/runway-guard", label: "RunwayGuard", group: "runwayguard", order: 1, searchAliases: ["runway"], searchKeywords: ["alerts", "cash runway"], requiresFeature: "runwayguard_core" },
  { href: "/settings/tax-buffer", label: "Tax Buffer", group: "taxbuffer", order: 1, searchAliases: ["taxbuffer"], searchKeywords: ["reserve", "gst", "payg"], requiresFeature: "tax_buffer_basic" },
  { href: "/settings/cash-plan", label: "Forecast settings", group: "cashplan", order: 1, searchAliases: ["cashplan"], searchKeywords: ["forecast", "assumptions"], requiresFeature: "accounting_integrations" },
]

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  ...SETTINGS_GROUP_DEFINITIONS.map((definition) => ({
    ...definition,
    items: SETTINGS_NAV_ITEMS.filter((item) => item.group === definition.id),
  })),
]

function byOrder<T extends { order: number }>(left: T, right: T): number {
  return left.order - right.order
}

export function getVisibleSettingsNavGroups(tier: string | null | undefined): SettingsNavGroup[] {
  return SETTINGS_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => {
        if (item.requiresFeature && !hasPlanFeature(tier, item.requiresFeature as never)) return false
        return item.isVisible ? item.isVisible(tier) : true
      })
      .sort(byOrder)
      .map(({ isVisible: _isVisible, ...item }) => item),
  }))
    .filter((group) => group.items.length > 0)
    .sort(byOrder)
}

export function getSettingsDiscoveryEntries(groups: SettingsNavGroup[]): SettingsDiscoveryEntry[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({
      href: item.href,
      label: item.label,
      groupId: group.id,
      groupLabel: group.label,
      terms: [item.label, group.label, group.searchLabel, ...(item.searchAliases ?? []), ...(item.searchKeywords ?? [])]
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term.length > 0),
    })),
  )
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

export function findActiveSettingsGroup(pathname: string, groups: SettingsNavGroup[]): SettingsNavGroup | undefined {
  const activeItem = groups.flatMap((group) => group.items).find((item) => isSettingsItemActive(pathname, item.href))
  if (!activeItem) return undefined
  return groups.find((group) => group.id === activeItem.group)
}

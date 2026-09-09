import { withUserContext } from "@/lib/db/withUserContext"
import type { OwnersDigestFrequency, OwnersDigestSettingsSnapshot } from "@/lib/ownersDigest/types"

export const OWNERS_DIGEST_DEFAULT_SETTINGS: OwnersDigestSettingsSnapshot = {
  enabled: true,
  emailEnabled: false,
  frequency: "weekly",
  deliveryDay: "monday",
  deliveryTime: "07:00",
  timezone: "Australia/Sydney",
  includeNeedsAttention: true,
  includeOpportunities: true,
  includePositiveChanges: true,
  includeKeyNumbers: true,
  maxActionItems: 5,
  minimumMaterialityCents: 10_000,
  sendWhenEmpty: true,
  recipientScope: "owner_only",
}

export type SaveOwnersDigestSettingsInput = Partial<OwnersDigestSettingsSnapshot>

const FREQUENCIES: OwnersDigestFrequency[] = ["off", "daily", "weekly", "monthly"]
const RECIPIENT_SCOPES = ["owner_only", "all_authorized_users"] as const

function normalizeFrequency(value: string | null | undefined): OwnersDigestFrequency {
  return FREQUENCIES.includes((value ?? "") as OwnersDigestFrequency)
    ? (value as OwnersDigestFrequency)
    : OWNERS_DIGEST_DEFAULT_SETTINGS.frequency
}

function normalizeDeliveryDay(value: string | null | undefined): string {
  const normalized = (value ?? OWNERS_DIGEST_DEFAULT_SETTINGS.deliveryDay).trim().toLowerCase()
  return normalized.length > 0 ? normalized : OWNERS_DIGEST_DEFAULT_SETTINGS.deliveryDay
}

function normalizeDeliveryTime(value: string | null | undefined): string {
  const normalized = (value ?? OWNERS_DIGEST_DEFAULT_SETTINGS.deliveryTime).trim()
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : OWNERS_DIGEST_DEFAULT_SETTINGS.deliveryTime
}

function normalizeTimezone(value: string | null | undefined): string {
  const normalized = (value ?? OWNERS_DIGEST_DEFAULT_SETTINGS.timezone).trim()
  return normalized.length > 0 ? normalized : OWNERS_DIGEST_DEFAULT_SETTINGS.timezone
}

function normalizeRecipientScope(
  value: string | null | undefined,
): OwnersDigestSettingsSnapshot["recipientScope"] {
  return RECIPIENT_SCOPES.includes((value ?? "") as (typeof RECIPIENT_SCOPES)[number])
    ? (value as OwnersDigestSettingsSnapshot["recipientScope"])
    : OWNERS_DIGEST_DEFAULT_SETTINGS.recipientScope
}

export function normalizeOwnersDigestSettings(input: Partial<OwnersDigestSettingsSnapshot>): OwnersDigestSettingsSnapshot {
  return {
    enabled: input.enabled ?? OWNERS_DIGEST_DEFAULT_SETTINGS.enabled,
    emailEnabled: input.emailEnabled ?? OWNERS_DIGEST_DEFAULT_SETTINGS.emailEnabled,
    frequency: normalizeFrequency(input.frequency),
    deliveryDay: normalizeDeliveryDay(input.deliveryDay),
    deliveryTime: normalizeDeliveryTime(input.deliveryTime),
    timezone: normalizeTimezone(input.timezone),
    includeNeedsAttention:
      input.includeNeedsAttention ?? OWNERS_DIGEST_DEFAULT_SETTINGS.includeNeedsAttention,
    includeOpportunities:
      input.includeOpportunities ?? OWNERS_DIGEST_DEFAULT_SETTINGS.includeOpportunities,
    includePositiveChanges:
      input.includePositiveChanges ?? OWNERS_DIGEST_DEFAULT_SETTINGS.includePositiveChanges,
    includeKeyNumbers: input.includeKeyNumbers ?? OWNERS_DIGEST_DEFAULT_SETTINGS.includeKeyNumbers,
    maxActionItems: Math.max(1, Math.min(10, Math.round(input.maxActionItems ?? OWNERS_DIGEST_DEFAULT_SETTINGS.maxActionItems))),
    minimumMaterialityCents: Math.max(
      0,
      Math.round(input.minimumMaterialityCents ?? OWNERS_DIGEST_DEFAULT_SETTINGS.minimumMaterialityCents),
    ),
    sendWhenEmpty: input.sendWhenEmpty ?? OWNERS_DIGEST_DEFAULT_SETTINGS.sendWhenEmpty,
    recipientScope: normalizeRecipientScope(input.recipientScope),
  }
}

export async function getOrCreateOwnersDigestSettings(userId: string): Promise<OwnersDigestSettingsSnapshot> {
  return withUserContext(userId, async (tx) => {
    const row = await tx.ownersDigestSetting.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        ...OWNERS_DIGEST_DEFAULT_SETTINGS,
      },
    })

    return normalizeOwnersDigestSettings({
      enabled: row.enabled,
      emailEnabled: row.emailEnabled,
      frequency: row.frequency as OwnersDigestFrequency,
      deliveryDay: row.deliveryDay,
      deliveryTime: row.deliveryTime,
      timezone: row.timezone,
      includeNeedsAttention: row.includeNeedsAttention,
      includeOpportunities: row.includeOpportunities,
      includePositiveChanges: row.includePositiveChanges,
      includeKeyNumbers: row.includeKeyNumbers,
      maxActionItems: row.maxActionItems,
      minimumMaterialityCents: row.minimumMaterialityCents,
      sendWhenEmpty: row.sendWhenEmpty,
      recipientScope: row.recipientScope as OwnersDigestSettingsSnapshot["recipientScope"],
    })
  })
}

export async function saveOwnersDigestSettings(
  userId: string,
  input: SaveOwnersDigestSettingsInput,
): Promise<OwnersDigestSettingsSnapshot> {
  const normalized = normalizeOwnersDigestSettings(input)

  return withUserContext(userId, async (tx) => {
    const row = await tx.ownersDigestSetting.upsert({
      where: { userId },
      create: {
        userId,
        ...normalized,
      },
      update: {
        ...normalized,
      },
    })

    return normalizeOwnersDigestSettings({
      enabled: row.enabled,
      emailEnabled: row.emailEnabled,
      frequency: row.frequency as OwnersDigestFrequency,
      deliveryDay: row.deliveryDay,
      deliveryTime: row.deliveryTime,
      timezone: row.timezone,
      includeNeedsAttention: row.includeNeedsAttention,
      includeOpportunities: row.includeOpportunities,
      includePositiveChanges: row.includePositiveChanges,
      includeKeyNumbers: row.includeKeyNumbers,
      maxActionItems: row.maxActionItems,
      minimumMaterialityCents: row.minimumMaterialityCents,
      sendWhenEmpty: row.sendWhenEmpty,
      recipientScope: row.recipientScope as OwnersDigestSettingsSnapshot["recipientScope"],
    })
  })
}

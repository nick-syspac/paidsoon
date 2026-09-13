import { withUserContext } from "@/lib/db/withUserContext"
import { requireDepositGuardRequestAccess } from "@/lib/depositGuard/entitlements"

export interface DepositGuardSettingsInput {
  autoReminderEnabled: boolean
  initialReminderOffsetDays: number
  beforeDueOffsetDays: number
  overdue3Enabled: boolean
  overdue7Enabled: boolean
  paymentProviderDefault: "manual_external_link" | "stripe_connect"
  requireDepositBeforeStart: boolean
  settingsJson?: Record<string, unknown> | null
}

export interface DepositGuardSettings extends DepositGuardSettingsInput {
  id: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function normalizeSettings(input: DepositGuardSettingsInput): DepositGuardSettingsInput {
  return {
    autoReminderEnabled: input.autoReminderEnabled,
    initialReminderOffsetDays: clampInt(input.initialReminderOffsetDays, 0, 30),
    beforeDueOffsetDays: clampInt(input.beforeDueOffsetDays, 0, 30),
    overdue3Enabled: input.overdue3Enabled,
    overdue7Enabled: input.overdue7Enabled,
    paymentProviderDefault: input.paymentProviderDefault,
    requireDepositBeforeStart: input.requireDepositBeforeStart,
    settingsJson: input.settingsJson ?? null,
  }
}

export async function getDepositGuardSettings(userId: string): Promise<DepositGuardSettings> {
  await requireDepositGuardRequestAccess(userId)

  return withUserContext(userId, async (tx) => {
    const existing = await tx.depositGuardSetting.findUnique({
      where: { userId },
    })

    if (existing) {
      return {
        ...existing,
        settingsJson:
          existing.settingsJson && typeof existing.settingsJson === "object"
            ? (existing.settingsJson as Record<string, unknown>)
            : null,
        paymentProviderDefault: existing.paymentProviderDefault as
          | "manual_external_link"
          | "stripe_connect",
      }
    }

    const created = await tx.depositGuardSetting.create({
      data: {
        userId,
      },
    })

    return {
      ...created,
      settingsJson: null,
      paymentProviderDefault: created.paymentProviderDefault as
        | "manual_external_link"
        | "stripe_connect",
    }
  })
}

export async function saveDepositGuardSettings(
  userId: string,
  input: DepositGuardSettingsInput,
): Promise<DepositGuardSettings> {
  await requireDepositGuardRequestAccess(userId)

  const normalized = normalizeSettings(input)

  return withUserContext(userId, async (tx) => {
    const saved = await tx.depositGuardSetting.upsert({
      where: { userId },
      update: {
        autoReminderEnabled: normalized.autoReminderEnabled,
        initialReminderOffsetDays: normalized.initialReminderOffsetDays,
        beforeDueOffsetDays: normalized.beforeDueOffsetDays,
        overdue3Enabled: normalized.overdue3Enabled,
        overdue7Enabled: normalized.overdue7Enabled,
        paymentProviderDefault: normalized.paymentProviderDefault,
        requireDepositBeforeStart: normalized.requireDepositBeforeStart,
        settingsJson: (normalized.settingsJson ?? null) as never,
      },
      create: {
        userId,
        autoReminderEnabled: normalized.autoReminderEnabled,
        initialReminderOffsetDays: normalized.initialReminderOffsetDays,
        beforeDueOffsetDays: normalized.beforeDueOffsetDays,
        overdue3Enabled: normalized.overdue3Enabled,
        overdue7Enabled: normalized.overdue7Enabled,
        paymentProviderDefault: normalized.paymentProviderDefault,
        requireDepositBeforeStart: normalized.requireDepositBeforeStart,
        settingsJson: (normalized.settingsJson ?? null) as never,
      },
    })

    await tx.depositGuardEvent.create({
      data: {
        userId,
        eventType: "settings_updated",
        actorUserId: userId,
        metadata: {
          autoReminderEnabled: saved.autoReminderEnabled,
          beforeDueOffsetDays: saved.beforeDueOffsetDays,
          paymentProviderDefault: saved.paymentProviderDefault,
        } as never,
      },
    })

    return {
      ...saved,
      settingsJson:
        saved.settingsJson && typeof saved.settingsJson === "object"
          ? (saved.settingsJson as Record<string, unknown>)
          : null,
      paymentProviderDefault: saved.paymentProviderDefault as
        | "manual_external_link"
        | "stripe_connect",
    }
  })
}

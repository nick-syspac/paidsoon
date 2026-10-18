import { requireSubscriptionAccess } from "@/lib/billing/accessGuard"
import { withUserContext } from "@/lib/db/withUserContext"

export type SpendClassificationSettingView = { enabled: boolean }

export async function getSpendClassificationSetting(userId: string): Promise<SpendClassificationSettingView> {
  await requireSubscriptionAccess(userId)
  return withUserContext(userId, async (tx) => {
    const setting = await tx.spendClassificationSetting.findUnique({
      where: { userId },
      select: { enabled: true },
    })
    return { enabled: setting?.enabled === true }
  })
}

export async function updateSpendClassificationSetting(
  userId: string,
  enabled: boolean,
): Promise<SpendClassificationSettingView> {
  await requireSubscriptionAccess(userId)
  return withUserContext(userId, async (tx) => {
    const setting = await tx.spendClassificationSetting.upsert({
      where: { userId },
      create: { userId, enabled },
      update: { enabled },
      select: { enabled: true },
    })
    return { enabled: setting.enabled }
  })
}

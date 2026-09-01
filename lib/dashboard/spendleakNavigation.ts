import type { SpendLeakModuleId } from "@/lib/dashboard/spendleakPresentation"

export function buildSpendLeakOverviewHref(
  showUnlockCta: boolean,
  moduleId: SpendLeakModuleId | null,
): string {
  if (showUnlockCta) return "/dashboard/settings/subscription?intent=spendleak"
  return moduleId ? `/dashboard/spendleak?module=${moduleId}` : "/dashboard/spendleak"
}

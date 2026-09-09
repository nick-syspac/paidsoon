import { withUserContext } from "@/lib/db/withUserContext"
import { requireRunwayGuardCoreAccess } from "@/lib/runwayGuard/entitlements"
import { defaultRunwayGuardPolicy } from "@/lib/runwayGuard/foundation"

export interface RunwayGuardSettingsSnapshot {
  enabled: boolean
  horizonDays: number
  warningThresholdDays: number
  criticalThresholdDays: number
  lowConfidenceWeight: number
  minimumConfidence: number
  availableCashCents: number | null
  protectedCashCents: number | null
  runwayDays: number | null
  confidence: "low" | "medium" | "high" | null
  status: string | null
}

export interface SaveRunwayGuardSettingsInput {
  enabled?: boolean
  horizonDays?: number
  warningThresholdDays?: number
  criticalThresholdDays?: number
  lowConfidenceWeight?: number
  minimumConfidence?: number
}

const DEFAULT_SETTINGS = {
  enabled: true,
  horizonDays: defaultRunwayGuardPolicy.horizonDays,
  warningThresholdDays: defaultRunwayGuardPolicy.warningThresholdDays,
  criticalThresholdDays: defaultRunwayGuardPolicy.criticalThresholdDays,
  lowConfidenceWeight: defaultRunwayGuardPolicy.lowConfidenceWeight,
  minimumConfidence: defaultRunwayGuardPolicy.minimumConfidence,
}

function mapSettingsSnapshot(row: {
  enabled: boolean
  horizonDays: number
  warningThresholdDays: number
  criticalThresholdDays: number
  lowConfidenceWeight: number
  minimumConfidence: number
}): Omit<RunwayGuardSettingsSnapshot, "availableCashCents" | "protectedCashCents" | "runwayDays" | "confidence" | "status"> {
  return {
    enabled: row.enabled,
    horizonDays: row.horizonDays,
    warningThresholdDays: row.warningThresholdDays,
    criticalThresholdDays: row.criticalThresholdDays,
    lowConfidenceWeight: row.lowConfidenceWeight,
    minimumConfidence: row.minimumConfidence,
  }
}

export async function getRunwayGuardSettings(userId: string): Promise<RunwayGuardSettingsSnapshot> {
  await requireRunwayGuardCoreAccess(userId)

  return withUserContext(userId, async (tx) => {
    const settings = await tx.runwayGuardSetting.upsert({
      where: { userId },
      create: {
        userId,
        ...DEFAULT_SETTINGS,
      },
      update: {},
      select: {
        enabled: true,
        horizonDays: true,
        warningThresholdDays: true,
        criticalThresholdDays: true,
        lowConfidenceWeight: true,
        minimumConfidence: true,
      },
    })

    return {
      ...mapSettingsSnapshot(settings),
      availableCashCents: null,
      protectedCashCents: null,
      runwayDays: null,
      confidence: null,
      status: null,
    }
  })
}

export async function saveRunwayGuardSettings(
  userId: string,
  input: SaveRunwayGuardSettingsInput,
): Promise<RunwayGuardSettingsSnapshot> {
  await requireRunwayGuardCoreAccess(userId)

  return withUserContext(userId, async (tx) => {
    const raw = {
      ...DEFAULT_SETTINGS,
      ...input,
    }

    if (raw.criticalThresholdDays >= raw.warningThresholdDays) {
      throw new Error("Thresholds must satisfy critical < warning")
    }

    const settings = await tx.runwayGuardSetting.upsert({
      where: { userId },
      create: {
        userId,
        enabled: raw.enabled,
        horizonDays: raw.horizonDays,
        warningThresholdDays: raw.warningThresholdDays,
        criticalThresholdDays: raw.criticalThresholdDays,
        lowConfidenceWeight: raw.lowConfidenceWeight,
        minimumConfidence: raw.minimumConfidence,
      },
      update: {
        enabled: raw.enabled,
        horizonDays: raw.horizonDays,
        warningThresholdDays: raw.warningThresholdDays,
        criticalThresholdDays: raw.criticalThresholdDays,
        lowConfidenceWeight: raw.lowConfidenceWeight,
        minimumConfidence: raw.minimumConfidence,
      },
      select: {
        enabled: true,
        horizonDays: true,
        warningThresholdDays: true,
        criticalThresholdDays: true,
        lowConfidenceWeight: true,
        minimumConfidence: true,
      },
    })

    return {
      ...mapSettingsSnapshot(settings),
      availableCashCents: null,
      protectedCashCents: null,
      runwayDays: null,
      confidence: null,
      status: null,
    }
  })
}

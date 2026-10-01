import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { Prisma } from "@/lib/generated/prisma/client"
import { randomUUID } from "node:crypto"
import {
  SPENDLEAK_SOURCE_TYPES,
  type SpendLeakSourceSettings,
  type SpendLeakSourceType,
  spendLeakSourceSettingsUpdateSchema,
} from "@/lib/spendleak/sourceSettingsContract"

export {
  SPENDLEAK_SOURCE_TYPES,
  spendLeakSourceSettingsUpdateSchema,
  type SpendLeakSourceSettings,
  type SpendLeakSourceType,
}

const SPENDLEAK_SOURCE_TYPE_SET: ReadonlySet<SpendLeakSourceType> = new Set(SPENDLEAK_SOURCE_TYPES)

function normalizeEnabledSourceTypes(value: unknown): SpendLeakSourceType[] {
  if (!Array.isArray(value)) return [...SPENDLEAK_SOURCE_TYPES]

  const normalized: SpendLeakSourceType[] = []
  for (const rawEntry of value) {
    if (typeof rawEntry !== "string") continue
    if (!SPENDLEAK_SOURCE_TYPE_SET.has(rawEntry as SpendLeakSourceType)) continue

    const sourceType = rawEntry as SpendLeakSourceType
    if (!normalized.includes(sourceType)) {
      normalized.push(sourceType)
    }
  }

  if (normalized.length === 0) return [...SPENDLEAK_SOURCE_TYPES]
  return normalized
}

function toTextArraySql(value: SpendLeakSourceType[]): Prisma.Sql {
  return Prisma.sql`ARRAY[${Prisma.join(value.map((entry) => Prisma.sql`${entry}`))}]::text[]`
}

interface SpendLeakSettingsRow {
  enabled_source_types: string[] | null
}

function defaultSpendLeakSourceSettings(): SpendLeakSourceSettings {
  return {
    enabledSourceTypes: [...SPENDLEAK_SOURCE_TYPES],
    isDefault: true,
  }
}

function isMissingSpendLeakSettingsTableError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false

  if (error.code === "P2010") {
    const code = typeof error.meta?.code === "string" ? error.meta.code : ""
    const message = typeof error.meta?.message === "string" ? error.meta.message : ""
    return code === "42P01" || message.includes("spend_leak_settings")
  }

  if (error.code === "P2021") {
    const table = typeof error.meta?.table === "string" ? error.meta.table : ""
    return table.includes("spend_leak_settings")
  }

  return false
}

export async function getSpendLeakSourceSettings(
  userId: string,
  tx?: PrismaTx,
): Promise<SpendLeakSourceSettings> {
  if (tx) {
    let rows: SpendLeakSettingsRow[]
    try {
      rows = await tx.$queryRaw<SpendLeakSettingsRow[]>(Prisma.sql`
        SELECT enabled_source_types
        FROM spend_leak_settings
        WHERE user_id = ${userId}
        LIMIT 1
      `)
    } catch (error) {
      if (isMissingSpendLeakSettingsTableError(error)) {
        return defaultSpendLeakSourceSettings()
      }
      throw error
    }

    if (rows.length === 0) {
      return defaultSpendLeakSourceSettings()
    }

    return {
      enabledSourceTypes: normalizeEnabledSourceTypes(rows[0]?.enabled_source_types),
      isDefault: false,
    }
  }

  return withUserContext(userId, async (innerTx) => getSpendLeakSourceSettings(userId, innerTx))
}

export async function updateSpendLeakSourceSettings(
  userId: string,
  enabledSourceTypes: SpendLeakSourceType[],
): Promise<SpendLeakSourceSettings> {
  const normalized = normalizeEnabledSourceTypes(enabledSourceTypes)
  const settingsId = `spendleak-setting-${randomUUID()}`

  return withUserContext(userId, async (tx) => {
    const rows = await tx.$queryRaw<SpendLeakSettingsRow[]>(Prisma.sql`
      INSERT INTO spend_leak_settings (id, user_id, enabled_source_types, updated_at)
      VALUES (${settingsId}, ${userId}, ${toTextArraySql(normalized)}, now())
      ON CONFLICT (user_id)
      DO UPDATE
      SET enabled_source_types = EXCLUDED.enabled_source_types,
          updated_at = now()
      RETURNING enabled_source_types
    `)

    return {
      enabledSourceTypes: normalizeEnabledSourceTypes(rows[0]?.enabled_source_types),
      isDefault: false,
    }
  })
}

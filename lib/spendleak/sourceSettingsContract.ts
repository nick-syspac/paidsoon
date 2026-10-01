import { z } from "zod"

export const SPENDLEAK_SOURCE_TYPES = ["bills", "bank_transactions", "suppliers"] as const

export type SpendLeakSourceType = (typeof SPENDLEAK_SOURCE_TYPES)[number]

export interface SpendLeakSourceSettings {
  enabledSourceTypes: SpendLeakSourceType[]
  isDefault: boolean
}

const sourceTypeSchema = z.enum(SPENDLEAK_SOURCE_TYPES)

export const spendLeakSourceSettingsUpdateSchema = z
  .object({
    enabledSourceTypes: z
      .array(sourceTypeSchema)
      .min(1, "Select at least one spend source")
      .refine((value) => new Set(value).size === value.length, "Duplicate source selections are not allowed"),
  })
  .strict()

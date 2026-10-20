/** Pure helpers shared with the legacy summary. Overrides arrive newest first. */
export interface TaxBufferOverrideInput {
  reserveCategoryId: string | null
  obligationId: string | null
  overrideValueCents: number
  reason: string
  createdBy: string | null
  createdAt: Date
}

export function estimateGstFromInvoiceAmount(amountCents: number): number {
  return amountCents <= 0 ? 0 : Math.round(amountCents / 11)
}

export function buildLatestOverrideMaps(overrides: readonly TaxBufferOverrideInput[]): {
  categoryOverrideById: Map<string, TaxBufferOverrideInput>
  obligationOverrideById: Map<string, TaxBufferOverrideInput>
} {
  const categoryOverrideById = new Map<string, TaxBufferOverrideInput>()
  const obligationOverrideById = new Map<string, TaxBufferOverrideInput>()
  for (const override of overrides) {
    if (override.reserveCategoryId && !categoryOverrideById.has(override.reserveCategoryId)) {
      categoryOverrideById.set(override.reserveCategoryId, override)
    }
    if (override.obligationId && !obligationOverrideById.has(override.obligationId)) {
      obligationOverrideById.set(override.obligationId, override)
    }
  }
  return { categoryOverrideById, obligationOverrideById }
}
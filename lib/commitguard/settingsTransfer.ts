import { CommitGuardSettingsSchema } from "@/lib/commitguard/settingsSchema"

/**
 * Portable policy only. The shared strict allowlist rejects unknown keys rather
 * than transferring cash, dated expense bases, tax attestations, or internal state.
 * Zod strips the special JSON __proto__ key rather than rejecting it; only parsed
 * policy reaches the mutation, so it cannot supply a prototype or persisted data.
 * safetyBufferWeeks is policy, not the owner's weekly-expense financial input.
 *
 * Unlike an ordinary partial edit, a supplied positive imported amount without a
 * currency has unknown provenance. Clear any destination label so it requires
 * confirmation; never inherit a saved label or infer one from current cash.
 * Omitted amounts/currencies otherwise retain normal partial-update semantics.
 */
export const CommitGuardSettingsImportSchema = CommitGuardSettingsSchema.transform((policy) => {
  if ((policy.safetyBufferFixedCents ?? 0) > 0 && policy.safetyBufferCurrency === undefined) {
    return { ...policy, safetyBufferCurrency: null }
  }
  return policy
})
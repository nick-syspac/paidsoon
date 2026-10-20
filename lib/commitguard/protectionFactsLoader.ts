import { requireFeature } from "@/lib/billing"
import { withUserContext, type PrismaTx } from "@/lib/db/withUserContext"
import { buildCommitGuardProtectionFacts, type CommitGuardProtectionFacts } from "@/lib/commitguard/protectionFacts"

/** D2 integration point for later summary/coverage composition, not a summary GET.
 * userId must be the authenticated server identity. All reads are tenant-scoped.
 * Reads only the tax attestation, never gross cash or CashPlan. No defaults,
 * obligation creation, snapshots or events; the legacy mutating service is not used.
 */
export async function loadCommitGuardProtectionFacts(
  userId: string,
  now: Date = new Date(),
): Promise<CommitGuardProtectionFacts> {
  const entitled = await requireFeature(userId, "tax_buffer_basic", { now })
  if (!entitled) return buildCommitGuardProtectionFacts({ entitled, configuration: null, taxProtectionCurrency: null,
    categories: [], overrides: [], financialInvoices: [], importedBills: [], now })
  return withUserContext(userId, (tx) => loadCommitGuardProtectionFactsInTransaction(tx, userId, entitled, now))
}

/** Reuse the read-only D2 adapter in a caller's existing tenant transaction. */
export async function loadCommitGuardProtectionFactsInTransaction(
  tx: PrismaTx, userId: string, entitled: boolean, now: Date,
  attestation?: { taxProtectionCurrency: string | null },
): Promise<CommitGuardProtectionFacts> {
  const empty = { entitled, configuration: null, taxProtectionCurrency: null,
    categories: [], overrides: [], financialInvoices: [], importedBills: [], now }
  if (!entitled) return buildCommitGuardProtectionFacts(empty)
  const configuration = await tx.taxBufferConfiguration.findUnique({
    where: { userId }, select: { enabled: true, accountingBasis: true },
  })
  if (!configuration || !configuration.enabled) {
    return buildCommitGuardProtectionFacts({ ...empty, configuration })
  }
  const [cashAttestation, categories, overrides] = await Promise.all([
    attestation ?? tx.commitGuardCashContext.findUnique({ where: { userId }, select: { taxProtectionCurrency: true } }),
    tx.taxReserveCategory.findMany({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, categoryType: true, name: true, enabled: true, calculationMethod: true,
        ratePercent: true, fixedAmountCents: true, manualAmountCents: true, updatedAt: true } }),
    tx.taxBufferOverride.findMany({ where: { userId, reserveCategoryId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { reserveCategoryId: true, obligationId: true, overrideValueCents: true,
        reason: true, createdBy: true, createdAt: true } }),
  ])
  const overridden = new Set(overrides.map((override) => override.reserveCategoryId))
  const calculated = categories.filter((category) => category.enabled && !overridden.has(category.id))
  const needsInvoices = calculated.some((category) =>
    category.calculationMethod.startsWith("percentage_") ||
    category.calculationMethod === "integration" && category.categoryType === "gst")
  const needsBills = calculated.some((category) => category.calculationMethod === "percentage_profit" ||
    category.calculationMethod === "integration" && category.categoryType === "gst")
  const [financialInvoices, importedBills] = await Promise.all([
    needsInvoices ? tx.financialInvoice.findMany({ where: { userId },
      select: { id: true, amountDueCents: true, currency: true, dueDate: true, syncedAt: true, sourceUpdatedAt: true },
      orderBy: { id: "asc" } }) : [],
    needsBills ? tx.importedBill.findMany({ where: { userId },
      select: { id: true, amountCents: true, gstCents: true, currency: true, syncedAt: true, sourceUpdatedAt: true },
      orderBy: { id: "asc" } }) : [],
  ])
  return buildCommitGuardProtectionFacts({ entitled, configuration,
    taxProtectionCurrency: cashAttestation?.taxProtectionCurrency ?? null,
    categories, overrides, financialInvoices, importedBills, now })
}
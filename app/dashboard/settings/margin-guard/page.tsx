import { redirect } from "next/navigation"

import { getSubscriptionTier } from "@/lib/billing"
import { withUserContext } from "@/lib/db/withUserContext"
import { canAccessMarginGuard } from "@/lib/dashboard/marginguardAccess"
import {
  listMarginClassifications,
  listMarginRules,
  listMarginTargets,
  getOrCreateMarginSettings,
} from "@/lib/marginguard/service"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { MarginGuardSettingsClient } from "@/components/settings/MarginGuardSettingsClient"

export default async function MarginGuardSettingsPage() {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const tier = await getSubscriptionTier(user.id)
  if (!canAccessMarginGuard(tier)) {
    redirect("/dashboard?intent=marginguard")
  }

  const [settings, targets, rules, classifications, sourceData] = await Promise.all([
    getOrCreateMarginSettings(user.id),
    listMarginTargets(user.id),
    listMarginRules(user.id),
    listMarginClassifications(user.id, { limit: 50 }),
    withUserContext(user.id, async (tx) => {
      const [connections, invoiceCount, billCount, txnCount] = await Promise.all([
        tx.accountingConnection.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            provider: true,
            organisationName: true,
            status: true,
            lastSyncedAt: true,
          },
          orderBy: { updatedAt: "desc" },
        }),
        tx.financialInvoice.count({ where: { userId: user.id } }),
        tx.importedBill.count({ where: { userId: user.id } }),
        tx.importedBankTransaction.count({ where: { userId: user.id } }),
      ])

      return {
        connections,
        invoiceCount,
        billCount,
        txnCount,
      }
    }),
  ])

  const sources = [
    {
      id: "paidsoon",
      label: "InvoiceGuard invoices",
      connected: sourceData.invoiceCount > 0,
      lastSyncAt: null,
      dataRange: sourceData.invoiceCount > 0 ? `${sourceData.invoiceCount} invoices` : "No records",
      status: sourceData.invoiceCount > 0 ? "available" : "incomplete",
    },
    {
      id: "bills",
      label: "Spend bills",
      connected: sourceData.billCount > 0,
      lastSyncAt: null,
      dataRange: sourceData.billCount > 0 ? `${sourceData.billCount} bills` : "No records",
      status: sourceData.billCount > 0 ? "available" : "incomplete",
    },
    {
      id: "transactions",
      label: "Bank transactions",
      connected: sourceData.txnCount > 0,
      lastSyncAt: null,
      dataRange: sourceData.txnCount > 0 ? `${sourceData.txnCount} transactions` : "No records",
      status: sourceData.txnCount > 0 ? "available" : "incomplete",
    },
    ...sourceData.connections.map((connection) => ({
      id: connection.id,
      label: `${connection.provider.toUpperCase()} · ${connection.organisationName}`,
      connected: connection.status === "active",
      lastSyncAt: connection.lastSyncedAt?.toISOString() ?? null,
      dataRange: "Connected accounting source",
      status: connection.status,
    })),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">MarginGuard settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure margin targets, alerts, classifications, and data-source readiness for MarginGuard.
        </p>
      </div>

      <MarginGuardSettingsClient
        initialSettings={{
          enabled: settings.enabled,
          defaultPeriod: settings.defaultPeriod as "30d" | "3m" | "6m" | "12m" | "fy",
          targetGrossMarginPercent: settings.targetGrossMarginPercent,
          warningGrossMarginPercent: settings.warningGrossMarginPercent,
          criticalGrossMarginPercent: settings.criticalGrossMarginPercent,
          minCompletenessPercent: settings.minCompletenessPercent,
          alertBelowWarning: settings.alertBelowWarning,
          alertBelowCritical: settings.alertBelowCritical,
          alertDeterioration: settings.alertDeterioration,
          alertNegativeMargin: settings.alertNegativeMargin,
          alertCustomerMarginWarning: settings.alertCustomerMarginWarning,
          alertCostIncrease: settings.alertCostIncrease,
          alertDataQualityWarning: settings.alertDataQualityWarning,
          alertDigestMode: (settings.alertDigestMode as "daily" | "weekly" | "monthly") ?? "daily",
        }}
        initialTargets={targets.map((target) => ({
          id: target.id,
          scopeType: target.scopeType,
          scopeKey: target.scopeKey,
          targetGrossMarginPercent: target.targetGrossMarginPercent,
          warningGrossMarginPercent: target.warningGrossMarginPercent,
          criticalGrossMarginPercent: target.criticalGrossMarginPercent,
          isActive: target.isActive,
        }))}
        initialRules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          ruleType: rule.ruleType as "supplier" | "category" | "account" | "text_match" | "recurring",
          classification: rule.classification as "DIRECT_COST" | "VARIABLE_COST" | "OVERHEAD" | "EXCLUDED" | "UNCLASSIFIED",
          priority: rule.priority,
          enabled: rule.enabled,
        }))}
        initialClassifications={classifications.map((row) => ({
          id: row.id,
          sourceType: row.sourceType,
          sourceRecordId: row.sourceRecordId,
          classification: row.classification as "DIRECT_COST" | "VARIABLE_COST" | "OVERHEAD" | "EXCLUDED" | "UNCLASSIFIED",
          classificationOrigin: row.classificationOrigin,
          updatedAt: row.updatedAt.toISOString(),
        }))}
        sources={sources}
      />
    </div>
  )
}

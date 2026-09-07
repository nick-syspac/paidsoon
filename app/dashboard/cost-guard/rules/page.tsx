import { redirect } from "next/navigation"

import { RuleEditor } from "@/components/dashboard/cost-guard/RuleEditor"
import { StatePanel } from "@/components/dashboard/cost-guard/StatePanel"
import { getAuthenticatedUser } from "@/lib/supabase/server"
import { withUserContext } from "@/lib/db/withUserContext"

const DEFAULT_RULES = [
  { name: "Supplier spend increase", ruleType: "supplier_increase", percentageThreshold: 20, absoluteThresholdCents: 10000, severity: "warning", enabled: true },
  { name: "Category drift", ruleType: "category_increase", percentageThreshold: 25, absoluteThresholdCents: 15000, severity: "warning", enabled: true },
  { name: "Large unusual invoice", ruleType: "large_unusual_invoice", percentageThreshold: 40, absoluteThresholdCents: 25000, severity: "critical", enabled: true },
  { name: "Forecast overrun", ruleType: "forecast_overrun", percentageThreshold: 10, absoluteThresholdCents: 5000, severity: "watch", enabled: true },
] as const

export default async function CostGuardRulesPage() {
  const { data: { user } } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const rules = await withUserContext(user.id, async (tx) =>
    tx.costGuardRule.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  )

  const displayedRules = rules.length > 0 ? rules : DEFAULT_RULES
  const enabledRules = displayedRules.filter((rule) => rule.enabled).length
  const hasConfiguredRules = rules.length > 0

  return (
    <div className="space-y-6">
      {!hasConfiguredRules ? (
        <StatePanel
          variant="info"
          title="Cost Guard onboarding is active"
          description="The default watchlist is enabled now. Add or tune rules below to match your spend thresholds and alert appetite."
          actionLabel="Review settings"
          actionHref="/dashboard/settings/cost-guard"
        />
      ) : null}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Rules</h2>
        <p className="text-sm text-gray-600">Manage automatic triggers for supplier, category, forecast, and anomaly-based cost alerts.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Configured</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{displayedRules.length}</p>
          <p className="mt-2 text-xs text-gray-600">Automatic detection rules in use</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Enabled</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">{enabledRules}</p>
          <p className="mt-2 text-xs text-gray-600">Rules currently applying to your data</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-gray-500">Alerting mode</p>
          <p className="mt-3 text-2xl font-semibold text-gray-900">Balanced</p>
          <p className="mt-2 text-xs text-gray-600">Default materiality and sensitivity profile</p>
        </div>
      </div>

      <RuleEditor />

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Rule</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Threshold</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayedRules.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-600">No custom rules configured yet.</td>
              </tr>
            ) : (
              displayedRules.map((rule) => (
                <tr key={"id" in rule ? rule.id : `${rule.ruleType}-${rule.name}`} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{rule.name}</td>
                  <td className="px-4 py-3">{rule.ruleType}</td>
                  <td className="px-4 py-3">{rule.percentageThreshold}% or A${rule.absoluteThresholdCents / 100}</td>
                  <td className="px-4 py-3">{rule.severity}</td>
                  <td className="px-4 py-3">{rule.enabled ? "Enabled" : "Disabled"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

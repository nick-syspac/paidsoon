import type { SpendLeakDashboardStatus } from "@/lib/dashboard/spendleakPresentation"

function toneClasses(state: SpendLeakDashboardStatus["state"]): string {
  if (state === "no_connection" || state === "initial_sync") return "border-amber-200 bg-amber-50 text-amber-900"
  if (state === "partial_data") return "border-blue-200 bg-blue-50 text-blue-900"
  if (state === "stale_data") return "border-orange-200 bg-orange-50 text-orange-900"
  if (state === "empty") return "border-emerald-200 bg-emerald-50 text-emerald-900"
  return "border-gray-200 bg-gray-50 text-gray-900"
}

export function SpendLeakStatusBanner({ status }: { status: SpendLeakDashboardStatus }): JSX.Element {
  return (
    <div className={`rounded-xl border p-4 ${toneClasses(status.state)}`}>
      <h2 className="text-sm font-semibold">{status.title}</h2>
      <p className="mt-1 text-sm leading-6">{status.description}</p>
    </div>
  )
}

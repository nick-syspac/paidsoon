import Link from "next/link"
import { formatAudCents, type SpendLeakModuleSummary } from "@/lib/dashboard/spendleakPresentation"

function severityClass(severity: SpendLeakModuleSummary["severity"]): string {
  if (severity === "red") return "border-red-200 bg-red-50 text-red-800"
  if (severity === "yellow") return "border-amber-200 bg-amber-50 text-amber-800"
  return "border-emerald-200 bg-emerald-50 text-emerald-800"
}

export function SpendLeakModuleGrid({ modules }: { modules: SpendLeakModuleSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {modules.map((module) => (
        <Link
          key={module.id}
          href={`/dashboard/spendleak?module=${module.id}`}
          className={`block rounded-xl border p-4 transition hover:shadow-sm ${severityClass(module.severity)}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide">{module.title}</p>
          <p className="mt-1 text-sm opacity-90">{module.description}</p>
          <div className="mt-3 flex items-end justify-between">
            <p className="text-2xl font-semibold">{module.findingCount}</p>
            <p className="text-sm font-medium">{formatAudCents(module.estimatedAnnualCents)} / yr</p>
          </div>
        </Link>
      ))}
    </div>
  )
}

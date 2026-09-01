import type { SpendInsight } from "@/lib/generated/prisma/client"
import { buildSpendLeakEvidenceView, formatAudCents } from "@/lib/dashboard/spendleakPresentation"

export function SpendLeakEvidenceDetails({ finding }: { finding: SpendInsight }): JSX.Element {
  const view = buildSpendLeakEvidenceView(finding)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {view.sourceSummary.map((field) => (
          <div key={field.label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{field.label}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{field.value}</p>
          </div>
        ))}
        {finding.estimatedMonthlyCents !== null && finding.estimatedMonthlyCents !== undefined && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Monthly impact</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{formatAudCents(finding.estimatedMonthlyCents)}</p>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {view.sections.map((section) => (
          <section key={section.title} className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">{section.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{section.description}</p>
            <dl className="mt-4 space-y-3">
              {section.fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs uppercase tracking-wide text-gray-500">{field.label}</dt>
                  <dd className="mt-1 text-sm text-gray-900">{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <details className="rounded-xl border border-gray-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">Raw evidence</summary>
        <div className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3">
          <pre className="text-xs text-gray-700">{JSON.stringify(finding.evidence, null, 2)}</pre>
        </div>
      </details>
    </div>
  )
}

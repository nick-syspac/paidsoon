import type { Diagnostic } from "@/lib/admin/diagnostics/types"
import { ActionButton } from "@/components/admin/tenant-detail/ActionButton"

interface Props {
  diagnostics: Diagnostic[]
  tenantUserId: string
}

const SEVERITY_STYLES = {
  error: {
    border: "border-red-800",
    badge: "bg-red-900 text-red-300",
    badgeLabel: "Error",
  },
  warning: {
    border: "border-yellow-800",
    badge: "bg-yellow-900 text-yellow-300",
    badgeLabel: "Warning",
  },
  info: {
    border: "border-blue-900",
    badge: "bg-blue-900 text-blue-300",
    badgeLabel: "Info",
  },
}

export function DiagnosticsSection({ diagnostics, tenantUserId }: Props) {
  const prominent = diagnostics.filter((d) => d.severity !== "info")
  const info = diagnostics.filter((d) => d.severity === "info")

  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Diagnostics</h2>

      {diagnostics.length === 0 ? (
        <p className="text-sm text-green-400">No issues detected.</p>
      ) : (
        <>
          {prominent.length > 0 && (
            <ul className="space-y-3 mb-4">
              {prominent.map((d, i) => {
                const styles = SEVERITY_STYLES[d.severity]
                return (
                  <li key={i} className={`border ${styles.border} rounded-lg p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${styles.badge}`}>
                            {styles.badgeLabel}
                          </span>
                          <span className="text-sm text-gray-100 font-medium">{d.title}</span>
                        </div>
                        <p className="text-sm text-gray-400">{d.description}</p>
                        <a
                          href={`/admin/runbooks/${d.runbookSlug}`}
                          className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                        >
                          View runbook →
                        </a>
                        {d.actions.map((action) => (
                          <ActionButton
                            key={action.actionSlug}
                            tenantUserId={tenantUserId}
                            action={action}
                          />
                        ))}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {info.length > 0 && (
            <ul className="space-y-1">
              {info.map((d, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-center gap-2">
                  <span className="text-blue-400">ℹ</span>
                  <span>{d.title}</span>
                  <a
                    href={`/admin/runbooks/${d.runbookSlug}`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    runbook →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}

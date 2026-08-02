import type { ReminderFunnelStep } from "@/lib/dashboard/reminderActivity"

export function ReminderActivityFunnel({ steps }: { steps: ReminderFunnelStep[] }) {
  const maxValue = Math.max(1, ...steps.map((step) => step.value ?? 0))

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-medium text-gray-600">Reminder Activity</h2>
      <ul className="mt-4 space-y-3">
        {steps.map((step) => {
          const widthPercent = step.value != null ? Math.max(4, Math.round((step.value / maxValue) * 100)) : 0
          return (
            <li key={step.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{step.label}</span>
                <span className="font-semibold text-gray-900">
                  {step.value != null ? step.value : <span className="text-xs text-gray-400">{step.note ?? "—"}</span>}
                </span>
              </div>
              {step.value != null && (
                <div className="mt-1 h-2 rounded bg-gray-100">
                  <div className="h-2 rounded bg-blue-500" style={{ width: `${widthPercent}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

import { RUNBOOKS } from "@/lib/admin/runbooks"

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-red-900 text-red-300",
  warning: "bg-yellow-900 text-yellow-300",
  info: "bg-blue-900 text-blue-300",
}

export default function AdminRunbooksPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Runbooks</h1>
      <p className="text-gray-400 text-sm">
        Operator runbooks for each diagnostic issue. Each runbook explains the cause and recommended resolution.
      </p>
      <ul className="space-y-2">
        {RUNBOOKS.map((rb) => (
          <li key={rb.slug}>
            <a
              href={`/admin/runbooks/${rb.slug}`}
              className="flex items-center justify-between bg-gray-900 hover:bg-gray-800 rounded-lg px-5 py-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${SEVERITY_BADGE[rb.severity] ?? "bg-gray-800 text-gray-400"}`}>
                  {rb.severity}
                </span>
                <span className="text-gray-100 text-sm">{rb.title}</span>
              </div>
              <span className="text-gray-500 text-xs">{rb.slug}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

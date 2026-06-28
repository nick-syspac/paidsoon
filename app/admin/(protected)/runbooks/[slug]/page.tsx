import { notFound } from "next/navigation"
import { getRunbook } from "@/lib/admin/runbooks"

interface Props {
  params: Promise<{ slug: string }>
}

export default async function AdminRunbookDetailPage({ params }: Props) {
  const { slug } = await params
  const runbook = getRunbook(slug)

  if (!runbook) notFound()

  const SEVERITY_BADGE: Record<string, string> = {
    error: "bg-red-900 text-red-300",
    warning: "bg-yellow-900 text-yellow-300",
    info: "bg-blue-900 text-blue-300",
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <a href="/admin/runbooks" className="text-gray-500 hover:text-gray-300 text-sm">
          ← Runbooks
        </a>
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${SEVERITY_BADGE[runbook.severity] ?? "bg-gray-800 text-gray-400"}`}>
          {runbook.severity}
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white">{runbook.title}</h1>
      <p className="text-gray-500 text-xs font-mono">diagnostic: {runbook.diagnosticSlug}</p>

      <div className="bg-gray-900 rounded-lg p-6">
        <pre className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed font-sans">
          {runbook.body}
        </pre>
      </div>
    </div>
  )
}

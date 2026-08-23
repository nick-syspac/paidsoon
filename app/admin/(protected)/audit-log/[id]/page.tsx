import { notFound } from "next/navigation"
import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"

function formatDateTime(value: Date | null): string {
  if (!value) return "—"
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export default async function AdminAuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminElevation({ minRole: "platform_support" })
  const { id } = await params

  const [session, event] = await Promise.all([
    prismaAdmin.adminSession.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        impersonatedUserId: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        actionCount: true,
      },
    }),
    prismaAdmin.adminAuditEvent.findUnique({
      where: { id },
      select: {
        id: true,
        adminSessionId: true,
        actorUserId: true,
        actorEmail: true,
        action: true,
        targetType: true,
        targetId: true,
        targetUserId: true,
        resourceId: true,
        reason: true,
        details: true,
        success: true,
        createdAt: true,
      },
    }),
  ])

  if (session) {
    const events = await prismaAdmin.adminAuditEvent.findMany({
      where: { adminSessionId: session.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        action: true,
        reason: true,
        success: true,
        createdAt: true,
      },
    })

    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Session detail</h1>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200 space-y-2">
          <p>Session ID: <span className="font-mono text-xs">{session.id}</span></p>
          <p>Admin user: <span className="font-mono text-xs">{session.userId}</span></p>
          <p>Target customer: <span className="font-mono text-xs">{session.impersonatedUserId ?? "—"}</span></p>
          <p>Started: {formatDateTime(session.startedAt)}</p>
          <p>Ended: {formatDateTime(session.endedAt)}</p>
          <p>Duration: {session.duration != null ? `${Math.max(1, Math.round(session.duration / 60))}m` : "—"}</p>
          <p>Action count: {session.actionCount}</p>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="px-4 py-2 text-sm text-gray-100 border-b border-gray-800">Linked audit events</div>
          {events.map((row) => (
            <a key={row.id} href={`/admin/audit-log/${row.id}`} className="flex items-center justify-between px-4 py-2 text-xs hover:bg-gray-800/70">
              <span className="font-mono text-gray-200">{row.action}</span>
              <span className="text-gray-500">{formatDateTime(row.createdAt)}</span>
              <span className="text-gray-400 truncate max-w-xs">{row.reason ?? "—"}</span>
              <span className={row.success ? "text-green-400" : "text-red-400"}>{row.success ? "OK" : "FAIL"}</span>
            </a>
          ))}
        </div>
      </div>
    )
  }

  if (event) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Audit event detail</h1>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 text-sm text-gray-200 space-y-2">
          <p>Event ID: <span className="font-mono text-xs">{event.id}</span></p>
          <p>Action: <span className="font-mono text-xs">{event.action}</span></p>
          <p>Actor: {event.actorEmail}</p>
          <p>Target user: <span className="font-mono text-xs">{event.targetUserId ?? "—"}</span></p>
          <p>Target type/id: {event.targetType ?? "—"} / <span className="font-mono text-xs">{event.targetId ?? "—"}</span></p>
          <p>Resource ID: <span className="font-mono text-xs">{event.resourceId ?? "—"}</span></p>
          <p>Reason: {event.reason ?? "—"}</p>
          <p>Result: <span className={event.success ? "text-green-400" : "text-red-400"}>{event.success ? "OK" : "FAIL"}</span></p>
          <p>At: {formatDateTime(event.createdAt)}</p>
          {event.adminSessionId && (
            <p>
              Session: <a href={`/admin/audit-log/${event.adminSessionId}`} className="text-blue-400 hover:text-blue-300">{event.adminSessionId}</a>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-white mb-2">Details payload</h2>
          <pre className="overflow-x-auto text-xs text-gray-300 whitespace-pre-wrap">{JSON.stringify(event.details, null, 2)}</pre>
        </div>
      </div>
    )
  }

  notFound()
}

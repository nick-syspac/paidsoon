import { notFound } from "next/navigation"
import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"

function formatDateTime(value: Date): string {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export default async function AuditEventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>
}) {
  await requireAdminElevation({ minRole: "platform_support" })
  const { eventId } = await params

  const event = await prismaAdmin.adminAuditEvent.findUnique({
    where: { id: eventId },
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
  })

  if (!event) notFound()

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
            Session: <a href={`/admin/audit-log/session/${event.adminSessionId}`} className="text-blue-400 hover:text-blue-300">{event.adminSessionId}</a>
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

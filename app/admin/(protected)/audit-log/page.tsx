import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"
import { AdminAuditAction } from "@/lib/generated/prisma/enums"

const ACTION_OPTIONS: AdminAuditAction[] = [
  "customer_search",
  "impersonate_start",
  "impersonate_end",
  "impersonate_timeout",
  "update_schedule",
  "pause_invoices",
  "resume_invoices",
  "trigger_email",
  "mark_invoice_paid",
]

function formatDateTime(value: Date): string {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ targetUserId?: string; sessionId?: string; action?: string }>
}) {
  await requireAdminElevation({ minRole: "platform_support" })
  const params = await searchParams

  const where: NonNullable<Parameters<typeof prismaAdmin.adminAuditEvent.findMany>[0]>["where"] = {}
  if (params.targetUserId) where.targetUserId = params.targetUserId
  if (params.sessionId) where.adminSessionId = params.sessionId
  if (params.action && ACTION_OPTIONS.includes(params.action as AdminAuditAction)) {
    where.action = params.action as AdminAuditAction
  }

  const events = await prismaAdmin.adminAuditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      adminSessionId: true,
      action: true,
      actorEmail: true,
      targetUserId: true,
      reason: true,
      success: true,
      createdAt: true,
    },
  })

  const grouped = new Map<string, typeof events>()
  const withoutSession: typeof events = []

  for (const event of events) {
    if (!event.adminSessionId) {
      withoutSession.push(event)
      continue
    }

    if (!grouped.has(event.adminSessionId)) grouped.set(event.adminSessionId, [])
    grouped.get(event.adminSessionId)!.push(event)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Audit Log</h1>

      <form className="rounded-lg border border-gray-800 bg-gray-900 p-4 grid gap-3 md:grid-cols-4" method="GET">
        <label className="text-xs text-gray-300">
          Target User ID
          <input
            name="targetUserId"
            defaultValue={params.targetUserId ?? ""}
            className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
          />
        </label>
        <label className="text-xs text-gray-300">
          Session ID
          <input
            name="sessionId"
            defaultValue={params.sessionId ?? ""}
            className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
          />
        </label>
        <label className="text-xs text-gray-300">
          Action
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className="mt-1 w-full rounded bg-gray-950 border border-gray-700 px-2 py-1 text-xs"
          >
            <option value="">Any</option>
            {ACTION_OPTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white">
            Apply filters
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([sessionId, sessionEvents]) => (
          <details key={sessionId} className="rounded border border-gray-800 bg-gray-900" open>
            <summary className="cursor-pointer px-4 py-2 text-sm text-gray-100">
              <a href={`/admin/audit-log/session/${sessionId}`} className="hover:text-blue-300">
                Session {sessionId}
              </a>{" "}
              ({sessionEvents.length} events)
            </summary>
            <div className="border-t border-gray-800">
              {sessionEvents.map((event) => (
                <a
                  key={event.id}
                  href={`/admin/audit-log/event/${event.id}`}
                  className="flex items-center justify-between px-4 py-2 text-xs hover:bg-gray-800/70"
                >
                  <span className="font-mono text-gray-200">{event.action}</span>
                  <span className="text-gray-400">{event.actorEmail}</span>
                  <span className={event.success ? "text-green-400" : "text-red-400"}>{event.success ? "OK" : "FAIL"}</span>
                  <span className="text-gray-500">{formatDateTime(event.createdAt)}</span>
                </a>
              ))}
            </div>
          </details>
        ))}

        {withoutSession.length > 0 && (
          <div className="rounded border border-gray-800 bg-gray-900">
            <div className="px-4 py-2 text-sm text-gray-100 border-b border-gray-800">Events without session</div>
            {withoutSession.map((event) => (
              <a
                key={event.id}
                href={`/admin/audit-log/event/${event.id}`}
                className="flex items-center justify-between px-4 py-2 text-xs hover:bg-gray-800/70"
              >
                <span className="font-mono text-gray-200">{event.action}</span>
                <span className="text-gray-400">{event.actorEmail}</span>
                <span className={event.success ? "text-green-400" : "text-red-400"}>{event.success ? "OK" : "FAIL"}</span>
                <span className="text-gray-500">{formatDateTime(event.createdAt)}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

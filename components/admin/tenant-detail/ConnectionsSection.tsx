import type { InvoiceConnection, AccountingConnection } from "@/lib/generated/prisma/client"

interface Props {
  stripeInvoiceConn: InvoiceConnection | null
  accountingConns: AccountingConnection[]
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  active: "bg-green-900 text-green-300",
  pending_first_sync: "bg-blue-900 text-blue-300",
  error: "bg-red-900 text-red-300",
  revoked: "bg-red-900 text-red-300",
  disconnected: "bg-gray-800 text-gray-400",
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  pending_first_sync: "Pending first sync",
  error: "Error",
  revoked: "Revoked",
  disconnected: "Disconnected",
}

export function ConnectionsSection({ stripeInvoiceConn, accountingConns }: Props) {
  return (
    <section className="bg-gray-900 rounded-lg p-5">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Connections</h2>

      {/* Stripe Connect */}
      <div className="mb-4">
        <h3 className="text-xs font-medium text-gray-500 mb-1">Stripe Connect</h3>
        {stripeInvoiceConn ? (
          <p className="text-sm text-green-400">
            Connected — account ID: <span className="font-mono text-xs text-gray-300">{stripeInvoiceConn.stripeConnectAccountId}</span>
          </p>
        ) : (
          <p className="text-sm text-yellow-400">Not connected</p>
        )}
      </div>

      {/* Accounting connections */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 mb-2">Accounting</h3>
        {accountingConns.length === 0 ? (
          <p className="text-sm text-gray-500">No accounting connections</p>
        ) : (
          <ul className="space-y-2">
            {accountingConns.map((conn) => (
              <li key={conn.id} className="text-sm border border-gray-800 rounded p-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-200 capitalize">{conn.provider} — {conn.organisationName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    STATUS_BADGE_STYLES[conn.status] ?? "bg-yellow-900 text-yellow-300"
                  }`}>
                    {STATUS_LABELS[conn.status] ?? conn.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Last synced: {conn.lastSyncedAt ? new Date(conn.lastSyncedAt).toLocaleString("en-AU") : "Never"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

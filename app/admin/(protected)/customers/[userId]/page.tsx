import Link from "next/link"
import { notFound } from "next/navigation"
import { requireAdminElevation } from "@/lib/admin/guard"
import { prismaAdmin } from "@/lib/db/admin"
import { ImpersonateButton } from "@/components/admin/ImpersonateButton"
import { CustomerQuickActions } from "@/components/admin/CustomerQuickActions"
import { CustomerInvoiceActions } from "@/components/admin/CustomerInvoiceActions"

const TIER_LABELS: Record<string, string> = {
  free: "Starter",
  starter: "Starter",
  pro: "Solo",
  solo: "Solo",
  small_business: "Small Business",
  accountant_partner: "Accountant Partner",
}

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  trialing: "text-blue-400",
  cancelled: "text-red-400",
  past_due: "text-yellow-400",
}

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatCurrency(amountCents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)
}

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  await requireAdminElevation()
  const { userId } = await params

  const profile = await prismaAdmin.userProfile.findUnique({
    where: { userId },
  })

  if (!profile) notFound()

  const [invoices, impersonationSessions, recentAudit, invoiceConnection, schedule] = await Promise.all([
    prismaAdmin.trackedInvoice.findMany({
      where: { userId },
      select: {
        id: true,
        status: true,
        financialInvoice: {
          select: {
            amountDueCents: true,
            currency: true,
            dueDate: true,
            sourceId: true,
            sourceSystem: true,
            contact: { select: { name: true } },
          },
        },
      },
      orderBy: { financialInvoice: { dueDate: "asc" } },
    }),
    prismaAdmin.adminSession.findMany({
      where: { impersonatedUserId: userId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        userId: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        actionCount: true,
        notifyCustomer: true,
        revokedAt: true,
      },
    }),
    prismaAdmin.adminAuditEvent.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        success: true,
        reason: true,
        createdAt: true,
      },
    }),
    prismaAdmin.invoiceConnection.findFirst({
      where: { userId, provider: "stripe" },
      select: { isActive: true, createdAt: true },
    }),
    prismaAdmin.schedule.findUnique({
      where: { userId },
      select: {
        email1DaysAfterDue: true,
        email2DaysAfterDue: true,
        email3DaysAfterDue: true,
      },
    }),
  ])

  const authUser = await prismaAdmin.$queryRaw`
    SELECT email FROM auth.users WHERE id = ${userId}
  ` as Array<{ email: string }>
  const email = authUser?.[0]?.email ?? "Unknown"

  const activeInvoices = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled")
  const overdueInvoices = activeInvoices.filter(
    (inv) => inv.financialInvoice.dueDate != null && inv.financialInvoice.dueDate < new Date() && inv.status !== "paid"
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
            <Link href="/admin/customers" className="hover:text-white">
              ← Customers
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-white">{profile.displayName || email}</h1>
          <p className="text-gray-400 text-sm mt-1">{email}</p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/admin/customers/${userId}/audit`}
            className="border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white px-4 py-2 rounded text-sm transition-colors"
          >
            View Audit Log
          </Link>
          <ImpersonateButton userId={userId} />
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-xs mb-1">Plan</p>
          <p className="text-white font-semibold">{TIER_LABELS[profile.subscriptionTier] ?? profile.subscriptionTier}</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-xs mb-1">Status</p>
          <p className={`font-semibold ${STATUS_COLORS[profile.subscriptionStatus] ?? "text-gray-400"}`}>
            {profile.subscriptionStatus}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-xs mb-1">Active Invoices</p>
          <p className="text-white font-semibold">
            {activeInvoices.length}
            {overdueInvoices.length > 0 && (
              <span className="text-yellow-400 text-xs ml-2">({overdueInvoices.length} overdue)</span>
            )}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <p className="text-gray-400 text-xs mb-1">Stripe Connected</p>
          <p className={`font-semibold ${invoiceConnection?.isActive ? "text-green-400" : "text-gray-500"}`}>
            {invoiceConnection?.isActive ? "Yes" : "No"}
          </p>
        </div>
      </div>

      {/* Profile details */}
      <section>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Account Details</h2>
        <div className="bg-gray-900 rounded-lg divide-y divide-gray-800">
          {[
            ["User ID", <span key="id" className="font-mono text-xs text-gray-400">{userId}</span>],
            ["Display Name", profile.displayName ?? <span key="dn" className="text-gray-600">Not set</span>],
            ["Email", email],
            ["Stripe Customer ID", profile.stripeCustomerId ?? <span key="sc" className="text-gray-600">—</span>],
            ["Trial Ends", formatDate(profile.trialEndsAt)],
            ["Onboarded", formatDate(profile.onboardingCompletedAt)],
            ["Member Since", formatDate(profile.createdAt)],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex px-4 py-3 text-sm">
              <span className="text-gray-400 w-40 shrink-0">{label}</span>
              <span className="text-gray-200">{value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Active invoices */}
      {activeInvoices.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Active Invoices ({activeInvoices.length})
          </h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paused</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-200">{inv.financialInvoice.contact?.name ?? ""}</td>
                    <td className="px-4 py-3 text-gray-200">{formatCurrency(inv.financialInvoice.amountDueCents, inv.financialInvoice.currency)}</td>
                    <td className={`px-4 py-3 text-xs ${inv.financialInvoice.dueDate && inv.financialInvoice.dueDate < new Date() ? "text-yellow-400" : "text-gray-400"}`}>
                      {formatDate(inv.financialInvoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{inv.status}</td>
                    <td className={`px-4 py-3 ${inv.status === "paused" ? "text-yellow-400" : "text-gray-600"}`}>
                      {inv.status === "paused" ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerInvoiceActions
                        userId={userId}
                        invoiceId={inv.id}
                        status={inv.status}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Impersonation history */}
      {impersonationSessions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Recent Support Sessions ({impersonationSessions.length})
          </h2>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3">Staff ID</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Ended</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {impersonationSessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.userId.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{formatDateTime(s.startedAt)}</td>
                    <td className="px-4 py-3 text-gray-300 text-xs">{formatDateTime(s.endedAt)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {s.duration != null ? `${Math.round(s.duration / 60)}m` : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{s.actionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent audit */}
      {recentAudit.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Recent Audit Activity
            </h2>
            <a
              href={`/admin/customers/${userId}/audit`}
              className="text-blue-400 hover:text-blue-300 text-xs"
            >
              View full log →
            </a>
          </div>
          <div className="bg-gray-900 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-left">
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.map((e) => (
                  <tr key={e.id} className="border-b border-gray-800 last:border-0">
                    <td className="px-4 py-3 text-gray-200 font-mono text-xs">{e.action}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.actorEmail}</td>
                    <td className={`px-4 py-3 text-xs ${e.success ? "text-green-400" : "text-red-400"}`}>
                      {e.success ? "OK" : "Failed"}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.reason || "—"}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Admin actions (Phase 5) — placeholder */}
      <CustomerQuickActions
        userId={userId}
        schedule={{
          email1DaysAfterDue: schedule?.email1DaysAfterDue ?? 3,
          email2DaysAfterDue: schedule?.email2DaysAfterDue ?? 10,
          email3DaysAfterDue: schedule?.email3DaysAfterDue ?? 21,
        }}
        invoices={activeInvoices.map((invoice) => ({
          id: invoice.id,
          clientName: invoice.financialInvoice.contact?.name ?? "",
          status: invoice.status,
          amountDue: invoice.financialInvoice.amountDueCents,
          currency: invoice.financialInvoice.currency,
        }))}
      />
    </div>
  )
}

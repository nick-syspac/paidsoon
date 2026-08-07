import Link from "next/link"
import { redirect } from "next/navigation"
import { requireAdminElevation, AdminGuardError } from "@/lib/admin/guard"
import { ImpersonationBanner } from "@/components/admin/ImpersonationBanner"
import { AdminSessionTimer } from "@/components/admin/AdminSessionTimer"

/**
 * Protected admin layout — enforces all three guard layers:
 *   1. Supabase auth (also enforced in middleware)
 *   2. PlatformRole
 *   3. AdminSession (SSH-key elevated session)
 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  let ctx: Awaited<ReturnType<typeof requireAdminElevation>>

  try {
    ctx = await requireAdminElevation()
  } catch (err) {
    if (err instanceof AdminGuardError) {
      if (err.code === "unauthenticated") {
        redirect("/sign-in")
      }
      if (err.code === "no_platform_role" || err.code === "role_disabled" || err.code === "insufficient_role") {
        redirect("/dashboard")
      }
      // elevation_required or session_expired — redirect to verify page
      redirect("/admin/verify")
    }
    throw err
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Admin session status bar */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-white">PaidSoon Admin</span>
            <nav className="flex gap-3 text-sm">
              <Link href="/admin/overview" className="text-gray-300 hover:text-white">Overview</Link>
              <Link href="/admin/tenants" className="text-gray-300 hover:text-white">Tenants</Link>
              <Link href="/admin/subscriptions" className="text-gray-300 hover:text-white">Subscriptions</Link>
              <Link href="/admin/integrations" className="text-gray-300 hover:text-white">Integrations</Link>
              <Link href="/admin/email-jobs" className="text-gray-300 hover:text-white">Email Jobs</Link>
              <Link href="/admin/admin-devices" className="text-gray-300 hover:text-white">Devices</Link>
              <Link href="/admin/staff" className="text-gray-300 hover:text-white">Staff</Link>
              <Link href="/admin/customers" className="text-gray-300 hover:text-white">Customers</Link>
              <Link href="/admin/training" className="text-gray-300 hover:text-white">Training</Link>
              <Link href="/admin/runbooks" className="text-gray-300 hover:text-white">Runbooks</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="capitalize">{ctx.platformRole.role.replace(/_/g, " ")}</span>
            <AdminSessionTimer expiresAtIso={ctx.adminSession.expiresAt.toISOString()} />
            <form action="/api/admin/sessions/revoke" method="POST">
              <button type="submit" className="text-red-400 hover:text-red-300 text-xs">
                End session
              </button>
            </form>
          </div>
        </div>
      </header>

      {ctx.adminSession.impersonatedTenantId && (
        <ImpersonationBanner tenantId={ctx.adminSession.impersonatedTenantId} />
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}

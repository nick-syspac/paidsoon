import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-gray-900 text-sm">
            PaidSoon
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Invoices
            </Link>
            <Link
              href="/dashboard/settings"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Settings
            </Link>
            <form action="/auth/sign-out" method="POST">
              <button
                type="submit"
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}

/**
 * Root admin layout — minimal passthrough.
 * Guard logic is applied in:
 *   - app/admin/(protected)/layout.tsx (full 3-layer guard for all protected pages)
 *   - app/admin/verify/page.tsx (2-layer guard: auth + role only, no session required)
 *
 * The middleware handles layer 1 (Supabase auth) for all /admin/* paths.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

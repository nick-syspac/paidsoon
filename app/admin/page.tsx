import { redirect } from "next/navigation"

/**
 * /admin → redirect to /admin/overview
 * This page is caught by the root admin layout (no guard).
 * The redirect target /admin/overview is protected by the (protected) layout.
 */
export default function AdminRootPage() {
  redirect("/admin/overview")
}

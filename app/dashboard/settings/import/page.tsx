import { redirect } from "next/navigation"
import { IMPORT_EXPORT_SETTINGS_INVOICE_IMPORT_ANCHOR } from "@/lib/settings/importExportRoutes"

export default async function ImportSettingsPage() {
  redirect(IMPORT_EXPORT_SETTINGS_INVOICE_IMPORT_ANCHOR)
}

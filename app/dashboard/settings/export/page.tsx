import { redirect } from "next/navigation"
import { IMPORT_EXPORT_SETTINGS_INVOICE_EXPORT_ANCHOR } from "@/lib/settings/importExportRoutes"

export default async function InvoiceExportSettingsPage() {
  redirect(IMPORT_EXPORT_SETTINGS_INVOICE_EXPORT_ANCHOR)
}

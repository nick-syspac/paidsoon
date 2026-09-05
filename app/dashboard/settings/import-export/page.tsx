import { redirect } from "next/navigation"
import type { ReactElement } from "react"

import { ImportExportSettingsView } from "@/components/settings/ImportExportSettingsView"
import { withUserContext } from "@/lib/db/withUserContext"
import { hasPlanFeature, normalizeSubscriptionTier } from "@/lib/subscriptionPlans"
import { getAuthenticatedUser } from "@/lib/supabase/server"

type InvoiceImportBatchSummary = {
  id: string
  fileName: string
  fileType: string
  status: string
  duplicateMode: string
  rowsTotal: number
  rowsValid: number
  rowsWarning: number
  rowsFailed: number
  rowsSkipped: number
  createdAt: string
  validatedAt: string | null
  completedAt: string | null
}

type ExportCustomer = { id: string; label: string }

type AuthenticatedUser = {
  id: string
}

async function loadInvoiceImportBatches(userId: string): Promise<InvoiceImportBatchSummary[]> {
  const batches = await withUserContext(userId, (tx) =>
    tx.invoiceImportBatch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        status: true,
        duplicateMode: true,
        rowsTotal: true,
        rowsValid: true,
        rowsWarning: true,
        rowsFailed: true,
        rowsSkipped: true,
        createdAt: true,
        validatedAt: true,
        completedAt: true,
      },
    }),
  )

  return batches.map((batch) => ({
    ...batch,
    createdAt: batch.createdAt.toISOString(),
    validatedAt: batch.validatedAt?.toISOString() ?? null,
    completedAt: batch.completedAt?.toISOString() ?? null,
  }))
}

async function loadExportCustomers(userId: string): Promise<ExportCustomer[]> {
  const customers = await withUserContext(userId, (tx) =>
    tx.customer.findMany({
      where: { userId },
      select: {
        id: true,
        financialContact: { select: { name: true, email: true } },
      },
    }),
  )

  return customers
    .map((customer) => ({
      id: customer.id,
      label: customer.financialContact.name || customer.financialContact.email || "Unknown",
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}

export default async function ImportExportSettingsPage(): Promise<ReactElement> {
  const {
    data: { user },
  } = await getAuthenticatedUser()
  if (!user) redirect("/sign-in")

  const authenticatedUser = user as AuthenticatedUser
  const [initialBatches, profile] = await Promise.all([
    loadInvoiceImportBatches(authenticatedUser.id),
    withUserContext(authenticatedUser.id, (tx) =>
      tx.userProfile.findUnique({
        where: { userId: authenticatedUser.id },
        select: { subscriptionTier: true },
      }),
    ),
  ])

  const tier = normalizeSubscriptionTier(profile?.subscriptionTier)
  const canExport = hasPlanFeature(tier, "csv_export")
  const exportCustomers = canExport ? await loadExportCustomers(authenticatedUser.id) : []

  return <ImportExportSettingsView initialBatches={initialBatches} canExport={canExport} exportCustomers={exportCustomers} />
}
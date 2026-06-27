/**
 * Accounting sync orchestrator.
 *
 * `syncConnection(connectionId)` — syncs one accounting connection:
 *   1. Refreshes the access token if it expires within 5 minutes
 *   2. Fetches invoices (incremental from lastSyncedAt, full on first sync)
 *   3. Fetches contacts for new/updated invoices
 *   4. Upserts TrackedInvoice rows (with a linked InvoiceConnection row)
 *   5. Upserts ProviderInvoiceMapping and ProviderContactMapping rows
 *   6. Cancels reminders for paid/voided invoices (clears nextEmailAt)
 *   7. Writes an AccountingSyncRun record on completion/failure
 *   8. Updates connection.lastSyncedAt on success
 *
 * `syncAllActiveConnections()` — iterates all active connections and calls
 * `syncConnection` for each. Called by the cron job.
 *
 * Uses `prismaAdmin` throughout (cron/background context — not user-facing).
 * This is intentional and documented (see copilot-instructions.md: prismaAdmin rules).
 *
 * Error handling:
 *   - AccountingProviderError({ kind: 'unauthorized' }) → marks connection status = 'revoked'
 *   - AccountingProviderError({ kind: 'rate_limited' }) → records error in sync run, skips
 *   - All other errors → records in sync run error_message, does not crash cron
 */

import { Prisma } from "@/lib/generated/prisma/client"
import { prismaAdmin } from "@/lib/db/admin"
import { getAccountingProvider } from "@/lib/providers/accounting"
import {
  AccountingProviderError,
  type ProviderInvoice,
  type ProviderContact,
} from "@/lib/providers/accounting/types"
import { encryptToken, decryptToken } from "@/lib/providers/accounting/crypto"

export interface SyncResult {
  connectionId: string
  provider: string
  status: "success" | "partial" | "failed"
  invoicesCreated: number
  invoicesUpdated: number
  invoicesSkipped: number
  errorMessage?: string
}

/** Pad amountDue from decimal provider amount to integer cents */
function toCents(amount: number): number {
  return Math.round(amount * 100)
}

/** Check if access token should be refreshed before a sync run.
 *
 * MYOB tokens expire in 20 minutes (1200 s). To prevent a long paginated
 * fetch from exhausting the token mid-run, always refresh for MYOB when
 * less than 21 minutes remain — effectively guaranteeing a fresh token at
 * the start of every MYOB sync.
 *
 * Xero tokens last 30 minutes; a 5-minute buffer is sufficient.
 */
function shouldRefresh(tokenExpiresAt: Date, provider: string): boolean {
  const BUFFER_MS = provider === "myob"
    ? 21 * 60 * 1000  // 21 min — always refresh before a MYOB sync
    : 5 * 60 * 1000   // 5 min — standard buffer for Xero (30 min tokens)
  return tokenExpiresAt.getTime() - Date.now() < BUFFER_MS
}

/** Retry with exponential backoff for transient provider errors */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // Don't retry auth errors or rate limits — caller handles them
      if (err instanceof AccountingProviderError) {
        if (err.kind === "unauthorized" || err.kind === "rate_limited") throw err
      }
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(4, attempt) // 2s, 8s, 32s
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}

export async function syncConnection(connectionId: string): Promise<SyncResult> {
  const result: SyncResult = {
    connectionId,
    provider: "",
    status: "failed",
    invoicesCreated: 0,
    invoicesUpdated: 0,
    invoicesSkipped: 0,
  }

  // Guard: skip if another sync is already running for this connection
  const inProgress = await prismaAdmin.accountingSyncRun.findFirst({
    where: { accountingConnectionId: connectionId, status: "running" },
    select: { id: true },
  })
  if (inProgress) {
    result.status = "skipped" as SyncResult["status"]
    result.errorMessage = "Sync already in progress"
    return result
  }

  // Fetch connection
  const connection = await prismaAdmin.accountingConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      userId: true,
      provider: true,
      organisationId: true,
      organisationName: true,
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
      status: true,
    },
  })

  if (!connection || connection.status !== "active") {
    result.errorMessage = "Connection not found or not active"
    return result
  }

  result.provider = connection.provider
  const provider = getAccountingProvider(connection.provider)

  // Create sync run record
  const syncRun = await prismaAdmin.accountingSyncRun.create({
    data: {
      accountingConnectionId: connectionId,
      provider: connection.provider,
      userId: connection.userId,
      status: "running",
    },
  })

  try {
    // --- Token refresh ---
    let accessToken = decryptToken(connection.encryptedAccessToken)
    let refreshToken = decryptToken(connection.encryptedRefreshToken)
    let tokenExpiresAt = connection.tokenExpiresAt

    if (shouldRefresh(tokenExpiresAt, connection.provider)) {
      const newTokens = await withRetry(() => provider.refreshTokens(refreshToken))
      accessToken = newTokens.accessToken
      refreshToken = newTokens.refreshToken
      tokenExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000)

      await prismaAdmin.accountingConnection.update({
        where: { id: connectionId },
        data: {
          encryptedAccessToken: encryptToken(accessToken),
          encryptedRefreshToken: encryptToken(refreshToken),
          tokenExpiresAt,
        },
      })
    }

    // --- Fetch invoices ---
    const modifiedAfter = connection.lastSyncedAt ?? undefined
    const invoices = await withRetry(() =>
      provider.getInvoices({
        accessToken,
        organisationId: connection.organisationId,
        modifiedAfter,
      })
    )

    // --- Fetch contacts for invoices ---
    const contactIds = [...new Set(invoices.map((i) => i.providerContactId).filter(Boolean))]
    const contactMap = new Map<string, ProviderContact>()

    if (contactIds.length > 0) {
      const contacts = await withRetry(() =>
        provider.getContacts({
          accessToken,
          organisationId: connection.organisationId,
          contactIds,
        })
      )
      for (const c of contacts) {
        contactMap.set(c.providerContactId, c)
      }
    }

    // --- Ensure an InvoiceConnection row exists for this accounting connection ---
    // TrackedInvoice requires a FK to InvoiceConnection. We maintain a shadow
    // InvoiceConnection row keyed by (userId, provider) to satisfy this constraint.
    let invoiceConnection = await prismaAdmin.invoiceConnection.findFirst({
      where: {
        userId: connection.userId,
        provider: connection.provider,
        isActive: true,
      },
      select: { id: true },
    })

    if (!invoiceConnection) {
      invoiceConnection = await prismaAdmin.invoiceConnection.create({
        data: {
          userId: connection.userId,
          provider: connection.provider,
          isActive: true,
        },
        select: { id: true },
      })
    }

    // --- Upsert invoices ---
    const syncStartedAt = new Date()

    for (const inv of invoices) {
      try {
        await upsertInvoice({
          inv,
          contactMap,
          connection,
          invoiceConnectionId: invoiceConnection.id,
          result,
        })
      } catch (err) {
        // Log but continue — partial sync is better than total failure
        console.error(
          `[sync] failed to upsert invoice ${inv.providerInvoiceId} for connection ${connectionId}`,
          err
        )
        result.invoicesSkipped++
      }
    }

    // --- Update connection lastSyncedAt ---
    await prismaAdmin.accountingConnection.update({
      where: { id: connectionId },
      data: { lastSyncedAt: syncStartedAt },
    })

    result.status = result.invoicesSkipped > 0 ? "partial" : "success"
  } catch (err) {
    if (err instanceof AccountingProviderError && err.kind === "unauthorized") {
      // Token revoked — mark connection so user can reconnect
      await prismaAdmin.accountingConnection.update({
        where: { id: connectionId },
        data: { status: "revoked" },
      })
      result.errorMessage = "Access token revoked — user must reconnect"
    } else if (err instanceof AccountingProviderError && err.kind === "rate_limited") {
      result.errorMessage = `Rate limited by ${connection.provider} — will retry next cycle`
    } else {
      result.errorMessage = err instanceof Error ? err.message : "Unknown error"
    }
    result.status = "failed"
  }

  // --- Write sync run result ---
  await prismaAdmin.accountingSyncRun.update({
    where: { id: syncRun.id },
    data: {
      completedAt: new Date(),
      status: result.status === "success" || result.status === "partial" ? result.status : "failed",
      invoicesCreated: result.invoicesCreated,
      invoicesUpdated: result.invoicesUpdated,
      invoicesSkipped: result.invoicesSkipped,
      errorMessage: result.errorMessage ?? null,
    },
  })

  return result
}

async function upsertInvoice(params: {
  inv: ProviderInvoice
  contactMap: Map<string, ProviderContact>
  connection: { id: string; userId: string; provider: string; organisationId: string }
  invoiceConnectionId: string
  result: SyncResult
}) {
  const { inv, contactMap, connection, invoiceConnectionId, result } = params
  const contact = contactMap.get(inv.providerContactId)
  const clientEmail = contact?.email ?? inv.clientEmail
  const clientName = contact?.name ?? inv.clientName

  // Determine TrackedInvoice status from provider status
  const invoiceStatus = mapProviderStatusToTracked(inv.status)

  // Idempotent upsert on (externalId, provider, userId)
  const existing = await prismaAdmin.trackedInvoice.findUnique({
    where: {
      externalId_provider_userId: {
        externalId: inv.providerInvoiceId,
        provider: connection.provider,
        userId: connection.userId,
      },
    },
    select: { id: true, status: true, nextEmailAt: true },
  })

  if (!existing) {
    // Create new TrackedInvoice
    const created = await prismaAdmin.trackedInvoice.create({
      data: {
        userId: connection.userId,
        invoiceConnectionId,
        externalId: inv.providerInvoiceId,
        provider: connection.provider,
        clientEmail,
        clientName,
        amountDue: toCents(inv.amountDue),
        currency: inv.currency.toLowerCase(),
        dueDate: inv.dueDate,
        status: invoiceStatus,
        currentStage: 0,
        // Only schedule reminders for open invoices
        nextEmailAt: invoiceStatus === "pending" ? inv.dueDate : null,
        providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })

    // Create ProviderInvoiceMapping
    await prismaAdmin.providerInvoiceMapping.create({
      data: {
        trackedInvoiceId: created.id,
        accountingConnectionId: connection.id,
        providerInvoiceId: inv.providerInvoiceId,
        providerUpdatedAt: inv.providerUpdatedAt ?? null,
        providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })

    // Upsert ProviderContactMapping
    if (inv.providerContactId) {
      await prismaAdmin.providerContactMapping.upsert({
        where: {
          providerContactId_accountingConnectionId: {
            providerContactId: inv.providerContactId,
            accountingConnectionId: connection.id,
          },
        },
        update: {
          contactName: clientName || null,
          contactEmail: clientEmail || null,
          providerMetadata: contact?.rawMetadata != null ? (contact.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
        },
        create: {
          accountingConnectionId: connection.id,
          providerContactId: inv.providerContactId,
          contactName: clientName || null,
          contactEmail: clientEmail || null,
          providerMetadata: contact?.rawMetadata != null ? (contact.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      })
    }

    result.invoicesCreated++
  } else {
    // Update existing TrackedInvoice
    const wasOpen = existing.status === "pending"
    const nowClosed = invoiceStatus === "paid" || invoiceStatus === "manually_resolved"

    await prismaAdmin.trackedInvoice.update({
      where: { id: existing.id },
      data: {
        clientEmail,
        clientName,
        amountDue: toCents(inv.amountDue),
        dueDate: inv.dueDate,
        status: invoiceStatus,
        // Cancel reminders when invoice transitions to paid/voided
        ...(wasOpen && nowClosed ? { nextEmailAt: null, currentStage: 0 } : {}),
        providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })

    // Update mapping's providerUpdatedAt
    await prismaAdmin.providerInvoiceMapping.updateMany({
      where: {
        trackedInvoiceId: existing.id,
        accountingConnectionId: connection.id,
      },
      data: {
        providerUpdatedAt: inv.providerUpdatedAt ?? null,
        providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })

    result.invoicesUpdated++
  }
}

/**
 * Map normalised provider invoice status to PaidSoon TrackedInvoice status.
 */
function mapProviderStatusToTracked(
  status: ProviderInvoice["status"]
): string {
  switch (status) {
    case "open":
      return "pending"
    case "paid":
      return "paid"
    case "voided":
      return "manually_resolved"
    case "draft":
      return "paused"
    default:
      return "pending" // unknown status — treat as open, will not silently skip
  }
}

/**
 * Sync all active accounting connections.
 * Called by the cron job. Errors in individual connections do not stop others.
 */
export async function syncAllActiveConnections(): Promise<SyncResult[]> {
  const connections = await prismaAdmin.accountingConnection.findMany({
    where: { status: "active" },
    select: { id: true },
  })

  const results: SyncResult[] = []
  for (const conn of connections) {
    try {
      const result = await syncConnection(conn.id)
      results.push(result)
    } catch (err) {
      // Unexpected error that wasn't caught inside syncConnection
      console.error(`[sync] unexpected error for connection ${conn.id}`, err)
      results.push({
        connectionId: conn.id,
        provider: "unknown",
        status: "failed",
        invoicesCreated: 0,
        invoicesUpdated: 0,
        invoicesSkipped: 0,
        errorMessage: "Unexpected error",
      })
    }
  }

  return results
}

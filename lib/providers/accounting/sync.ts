/**
 * Accounting sync orchestrator.
 *
 * `syncConnection(connectionId)` — syncs one accounting connection:
 *   1. Refreshes the access token if it expires soon (5 min buffer for Xero;
 *      MYOB always refreshes — see shouldRefresh). For MYOB, the first API
 *      call after a fresh refresh tolerates a transient post-refresh 401
 *      (token propagation delay) via withTokenPropagationRetry instead of
 *      immediately marking the connection revoked.
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
 *
 * Connection status lifecycle (see `resolveConnectionStatusAfterSync`):
 *   - A newly created connection starts as 'pending_first_sync' (callback does not
 *     imply invoice import is already complete).
 *   - The first successful (or partial) sync promotes the connection to 'active'.
 *   - A failure on that first sync sets status = 'error' so it is visibly actionable
 *     instead of silently stuck as pending; an already-'active' connection is not
 *     downgraded by a single transient failure — that failure is recorded on the
 *     AccountingSyncRun row instead.
 *   - 'disconnected' is a terminal, user-initiated state and is never overwritten
 *     by a sync outcome.
 */

import { Prisma } from "@/lib/generated/prisma/client"
import { prismaAdmin } from "@/lib/db/admin"
import { findOrCreateCustomer } from "@/lib/db/customers"
import { detectSpendFindings } from "@/lib/spendleak/engine"
import {
  upsertFinancialContact,
  upsertFinancialInvoice,
} from "@/lib/financial/ingest"
import { getAccountingProvider } from "@/lib/providers/accounting"
import { isDemoOrganisationId } from "@/lib/providers/accounting/demoGuard"
import {
  AccountingProviderError,
  type AccountingProviderErrorKind,
  type ProviderInvoice,
  type ProviderContact,
  type ProviderSpendBill,
  type ProviderSpendBankTransaction,
  type ProviderSpendSupplier,
  type ProviderSpendExpenseAccount,
} from "@/lib/providers/accounting/types"
import { encryptToken, decryptToken } from "@/lib/providers/accounting/crypto"

export interface SyncResult {
  connectionId: string
  provider: string
  status: "success" | "partial" | "failed"
  invoicesCreated: number
  invoicesUpdated: number
  invoicesSkipped: number
  spendBillsUpserted: number
  spendTransactionsUpserted: number
  spendSuppliersUpserted: number
  errorMessage?: string
}

/** Pad amountDue from decimal provider amount to integer cents */
function toCents(amount: number): number {
  return Math.round(amount * 100)
}

function asJsonOrDbNull(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value != null ? (value as Prisma.InputJsonValue) : Prisma.DbNull
}

function mapExpenseAccountsByCode(accounts: ProviderSpendExpenseAccount[]): Map<string, ProviderSpendExpenseAccount> {
  const byCode = new Map<string, ProviderSpendExpenseAccount>()
  for (const account of accounts) {
    if (!account.accountCode) continue
    byCode.set(account.accountCode.trim().toLowerCase(), account)
  }
  return byCode
}

async function upsertImportedSpendBill(params: {
  userId: string
  accountingConnectionId: string
  bill: ProviderSpendBill
  expenseAccountsByCode: Map<string, ProviderSpendExpenseAccount>
  syncedAt: Date
}): Promise<void> {
  const { userId, accountingConnectionId, bill, expenseAccountsByCode, syncedAt } = params
  const accountFromBill = bill.expenseAccountCode?.trim().toLowerCase()
  const matchedAccount = accountFromBill ? expenseAccountsByCode.get(accountFromBill) : undefined

  await prismaAdmin.importedBill.upsert({
    where: {
      accountingConnectionId_sourceId: {
        accountingConnectionId,
        sourceId: bill.providerBillId,
      },
    },
    create: {
      userId,
      accountingConnectionId,
      sourceId: bill.providerBillId,
      sourceContactId: bill.providerSupplierId ?? null,
      supplierName: bill.supplierName,
      supplierReference: bill.supplierReference ?? null,
      documentNumber: bill.documentNumber ?? null,
      expenseAccountCode: bill.expenseAccountCode ?? matchedAccount?.accountCode ?? null,
      expenseAccountName: bill.expenseAccountName ?? matchedAccount?.accountName ?? null,
      amountCents: Math.abs(toCents(bill.amountTotal)),
      gstCents: bill.gstAmount == null ? null : Math.abs(toCents(bill.gstAmount)),
      currency: bill.currency,
      dueDate: bill.dueDate ?? null,
      paidDate: bill.paidDate ?? null,
      status: bill.status,
      sourceUpdatedAt: bill.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(bill.rawMetadata),
    },
    update: {
      sourceContactId: bill.providerSupplierId ?? null,
      supplierName: bill.supplierName,
      supplierReference: bill.supplierReference ?? null,
      documentNumber: bill.documentNumber ?? null,
      expenseAccountCode: bill.expenseAccountCode ?? matchedAccount?.accountCode ?? null,
      expenseAccountName: bill.expenseAccountName ?? matchedAccount?.accountName ?? null,
      amountCents: Math.abs(toCents(bill.amountTotal)),
      gstCents: bill.gstAmount == null ? null : Math.abs(toCents(bill.gstAmount)),
      currency: bill.currency,
      dueDate: bill.dueDate ?? null,
      paidDate: bill.paidDate ?? null,
      status: bill.status,
      sourceUpdatedAt: bill.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(bill.rawMetadata),
    },
  })
}

async function upsertImportedSpendBankTransaction(params: {
  userId: string
  accountingConnectionId: string
  transaction: ProviderSpendBankTransaction
  syncedAt: Date
}): Promise<void> {
  const { userId, accountingConnectionId, transaction, syncedAt } = params

  await prismaAdmin.importedBankTransaction.upsert({
    where: {
      accountingConnectionId_sourceId: {
        accountingConnectionId,
        sourceId: transaction.providerTransactionId,
      },
    },
    create: {
      userId,
      accountingConnectionId,
      sourceId: transaction.providerTransactionId,
      sourceContactId: transaction.providerSupplierId ?? null,
      accountName: transaction.accountName ?? null,
      accountCode: transaction.accountCode ?? null,
      description: transaction.description,
      reference: transaction.reference ?? null,
      counterpartyName: transaction.counterpartyName ?? null,
      amountCents: toCents(transaction.amount),
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      sourceUpdatedAt: transaction.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(transaction.rawMetadata),
    },
    update: {
      sourceContactId: transaction.providerSupplierId ?? null,
      accountName: transaction.accountName ?? null,
      accountCode: transaction.accountCode ?? null,
      description: transaction.description,
      reference: transaction.reference ?? null,
      counterpartyName: transaction.counterpartyName ?? null,
      amountCents: toCents(transaction.amount),
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      sourceUpdatedAt: transaction.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(transaction.rawMetadata),
    },
  })
}

async function upsertImportedSpendSupplier(params: {
  userId: string
  accountingConnectionId: string
  supplier: ProviderSpendSupplier
  syncedAt: Date
}): Promise<void> {
  const { userId, accountingConnectionId, supplier, syncedAt } = params

  await prismaAdmin.supplierProfile.upsert({
    where: {
      accountingConnectionId_sourceId: {
        accountingConnectionId,
        sourceId: supplier.providerSupplierId,
      },
    },
    create: {
      userId,
      accountingConnectionId,
      sourceId: supplier.providerSupplierId,
      supplierName: supplier.supplierName,
      supplierEmail: supplier.supplierEmail ?? null,
      abn: supplier.abn ?? null,
      paymentTerms: supplier.paymentTerms ?? null,
      defaultAccountCode: supplier.defaultAccountCode ?? null,
      defaultAccountName: supplier.defaultAccountName ?? null,
      sourceUpdatedAt: supplier.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(supplier.rawMetadata),
    },
    update: {
      supplierName: supplier.supplierName,
      supplierEmail: supplier.supplierEmail ?? null,
      abn: supplier.abn ?? null,
      paymentTerms: supplier.paymentTerms ?? null,
      defaultAccountCode: supplier.defaultAccountCode ?? null,
      defaultAccountName: supplier.defaultAccountName ?? null,
      sourceUpdatedAt: supplier.providerUpdatedAt ?? null,
      syncedAt,
      rawSourceData: asJsonOrDbNull(supplier.rawMetadata),
    },
  })
}

async function syncSpendSideData(params: {
  connection: {
    id: string
    userId: string
    organisationId: string
  }
  accessToken: string
  modifiedAfter?: Date
  provider: ReturnType<typeof getAccountingProvider>
}): Promise<{
  billsUpserted: number
  transactionsUpserted: number
  suppliersUpserted: number
  spendBills: ProviderSpendBill[]
  spendTransactions: ProviderSpendBankTransaction[]
  spendSuppliers: ProviderSpendSupplier[]
  failures: string[]
}> {
  const { connection, accessToken, modifiedAfter, provider } = params
  const syncedAt = new Date()
  const failures: string[] = []

  let spendBills: ProviderSpendBill[] = []
  let spendTransactions: ProviderSpendBankTransaction[] = []
  let spendSuppliers: ProviderSpendSupplier[] = []
  let expenseAccounts: ProviderSpendExpenseAccount[] = []

  try {
    spendBills = await withRetry(() =>
      provider.getSpendBills({
        accessToken,
        organisationId: connection.organisationId,
        modifiedAfter,
      }),
    )
  } catch (err) {
    failures.push(`bills:${err instanceof Error ? err.message : "unknown error"}`)
  }

  try {
    spendTransactions = await withRetry(() =>
      provider.getSpendBankTransactions({
        accessToken,
        organisationId: connection.organisationId,
        modifiedAfter,
      }),
    )
  } catch (err) {
    failures.push(`bank-transactions:${err instanceof Error ? err.message : "unknown error"}`)
  }

  try {
    expenseAccounts = await withRetry(() =>
      provider.getSpendExpenseAccounts({
        accessToken,
        organisationId: connection.organisationId,
      }),
    )
  } catch (err) {
    failures.push(`expense-accounts:${err instanceof Error ? err.message : "unknown error"}`)
  }

  try {
    const supplierIds = [
      ...new Set(
        [...spendBills, ...spendTransactions]
          .map((row) => row.providerSupplierId)
          .filter((value): value is string => typeof value === "string" && value.length > 0),
      ),
    ]
    spendSuppliers = await withRetry(() =>
      provider.getSpendSuppliers({
        accessToken,
        organisationId: connection.organisationId,
        supplierIds: supplierIds.length > 0 ? supplierIds : undefined,
      }),
    )
  } catch (err) {
    failures.push(`suppliers:${err instanceof Error ? err.message : "unknown error"}`)
  }

  const expenseAccountsByCode = mapExpenseAccountsByCode(expenseAccounts)

  for (const bill of spendBills) {
    try {
      await upsertImportedSpendBill({
        userId: connection.userId,
        accountingConnectionId: connection.id,
        bill,
        expenseAccountsByCode,
        syncedAt,
      })
    } catch (err) {
      failures.push(`bill-upsert:${err instanceof Error ? err.message : "unknown error"}`)
    }
  }

  for (const transaction of spendTransactions) {
    try {
      await upsertImportedSpendBankTransaction({
        userId: connection.userId,
        accountingConnectionId: connection.id,
        transaction,
        syncedAt,
      })
    } catch (err) {
      failures.push(`bank-transaction-upsert:${err instanceof Error ? err.message : "unknown error"}`)
    }
  }

  for (const supplier of spendSuppliers) {
    try {
      await upsertImportedSpendSupplier({
        userId: connection.userId,
        accountingConnectionId: connection.id,
        supplier,
        syncedAt,
      })
    } catch (err) {
      failures.push(`supplier-upsert:${err instanceof Error ? err.message : "unknown error"}`)
    }
  }

  return {
    billsUpserted: spendBills.length,
    transactionsUpserted: spendTransactions.length,
    suppliersUpserted: spendSuppliers.length,
    spendBills,
    spendTransactions,
    spendSuppliers,
    failures,
  }
}

async function persistSpendFindings(params: {
  userId: string
  accountingConnectionId: string
  findings: ReturnType<typeof detectSpendFindings>
}): Promise<number> {
  const { userId, accountingConnectionId, findings } = params
  let upserted = 0

  for (const finding of findings) {
    await prismaAdmin.spendInsight.upsert({
      where: {
        userId_findingType_subjectKey: {
          userId,
          findingType: finding.findingType,
          subjectKey: finding.subjectKey,
        },
      },
      create: {
        userId,
        accountingConnectionId,
        findingType: finding.findingType,
        subjectKey: finding.subjectKey,
        severity: finding.severity,
        summary: finding.summary,
        state: "open",
        estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
        estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
        evidence: finding.evidence as Prisma.InputJsonValue,
        detectedAt: finding.detectedAt,
      },
      update: {
        accountingConnectionId,
        severity: finding.severity,
        summary: finding.summary,
        estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
        estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
        evidence: finding.evidence as Prisma.InputJsonValue,
        detectedAt: finding.detectedAt,
      },
    })
    upserted += 1
  }

  return upserted
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

/**
 * Connection statuses that are eligible for a sync attempt.
 * - 'active' — steady-state connection, already collecting data.
 * - 'pending_first_sync' — connected but no successful sync has completed yet.
 * - 'error' — a previous first sync failed; user or cron may retry.
 * 'disconnected' and 'revoked' are terminal until the user reconnects.
 */
const SYNCABLE_STATUSES = new Set(["active", "pending_first_sync", "error"])

/**
 * Pure function that resolves the next `AccountingConnection.status` given the
 * status before the sync attempt and its outcome. Returns `null` when the
 * status should not change.
 *
 * Exported for direct unit testing (no DB or network dependencies).
 */
export function resolveConnectionStatusAfterSync(
  currentStatus: string,
  outcome: "success" | "partial" | "failed",
  errorKind?: AccountingProviderErrorKind
): string | null {
  // A user-initiated disconnect is terminal — never silently resurrect it.
  if (currentStatus === "disconnected") return null

  if (outcome === "success" || outcome === "partial") {
    return currentStatus === "active" ? null : "active"
  }

  // outcome === "failed"
  if (errorKind === "unauthorized") return "revoked"
  // Only the first sync attempt downgrades to 'error' — an already-active
  // connection stays active on a transient failure; the failure is recorded
  // on the AccountingSyncRun row instead.
  if (currentStatus === "pending_first_sync") return "error"
  return null
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

/**
 * MYOB access tokens can take a moment to propagate through MYOB's backend
 * immediately after being minted — including right after a *refresh*, not
 * just after the initial OAuth code exchange (the same quirk already
 * handled for `getOrganisations` in app/api/integrations/myob/callback/route.ts).
 * Calling an API with a brand-new token in this window can return a
 * transient 401 (`OAuthTokenIsInvalid`) even though the token is valid.
 *
 * `shouldRefresh`'s 21-minute buffer means *every* MYOB sync refreshes its
 * token before the first API call, so every sync re-rolls this propagation
 * race. Without this retry, a transient 401 here is indistinguishable from
 * a genuinely revoked token and `resolveConnectionStatusAfterSync` would
 * permanently mark the connection `revoked` (requiring the user to
 * reconnect) even though nothing was actually wrong with the credential.
 *
 * Mirrors TOKEN_PROPAGATION_RETRY_DELAYS_MS in the callback route.
 */
const TOKEN_PROPAGATION_RETRY_DELAYS_MS = [1500, 3000, 6000, 10000]

async function withTokenPropagationRetry<T>(
  fn: () => Promise<T>,
  connectionId: string
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isUnauthorized = err instanceof AccountingProviderError && err.kind === "unauthorized"
      if (!isUnauthorized || attempt >= TOKEN_PROPAGATION_RETRY_DELAYS_MS.length) throw err
      console.warn(
        `[sync] connection ${connectionId} got 401 right after MYOB token refresh, retrying in ${TOKEN_PROPAGATION_RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1})`
      )
      await new Promise((resolve) => setTimeout(resolve, TOKEN_PROPAGATION_RETRY_DELAYS_MS[attempt]))
    }
  }
}

export async function syncConnection(connectionId: string): Promise<SyncResult> {
  const result: SyncResult = {
    connectionId,
    provider: "",
    status: "failed",
    invoicesCreated: 0,
    invoicesUpdated: 0,
    invoicesSkipped: 0,
    spendBillsUpserted: 0,
    spendTransactionsUpserted: 0,
    spendSuppliersUpserted: 0,
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

  if (!connection || !SYNCABLE_STATUSES.has(connection.status)) {
    result.errorMessage = "Connection not found or not syncable"
    return result
  }

  // Development seed data holds placeholder tokens and a reserved organisation id.
  // Never open a provider connection on it — see lib/providers/accounting/demoGuard.ts.
  if (isDemoOrganisationId(connection.organisationId)) {
    result.status = "skipped" as SyncResult["status"]
    result.provider = connection.provider
    result.errorMessage = "Demo seed connection — sync skipped"
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

    // Tracks whether this run just minted a fresh MYOB token, so the first
    // API call below knows to tolerate a transient post-refresh 401 instead
    // of treating it as a genuine revocation (see withTokenPropagationRetry).
    let justRefreshedMyob = false

    if (shouldRefresh(tokenExpiresAt, connection.provider)) {
      const newTokens = await withRetry(() => provider.refreshTokens(refreshToken))
      accessToken = newTokens.accessToken
      refreshToken = newTokens.refreshToken
      tokenExpiresAt = new Date(Date.now() + newTokens.expiresIn * 1000)
      justRefreshedMyob = connection.provider === "myob"

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
    const fetchInvoices = () =>
      provider.getInvoices({
        accessToken,
        organisationId: connection.organisationId,
        modifiedAfter,
      })
    const invoices = await withRetry(() =>
      justRefreshedMyob ? withTokenPropagationRetry(fetchInvoices, connectionId) : fetchInvoices()
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

    // SpendLeak spend-side sync runs in the same cadence and connection scope
    // as receivables sync so freshness stays aligned for dashboard summaries.
    const spendSync = await syncSpendSideData({
      connection,
      accessToken,
      modifiedAfter,
      provider,
    })
    result.spendBillsUpserted = spendSync.billsUpserted
    result.spendTransactionsUpserted = spendSync.transactionsUpserted
    result.spendSuppliersUpserted = spendSync.suppliersUpserted

    const latestCashSnapshot = await prismaAdmin.cashForecastSnapshot.findFirst({
      where: { userId: connection.userId },
      orderBy: { snapshotAt: "desc" },
      select: { currentCashCents: true },
    })

    const openReceivables = await prismaAdmin.financialInvoice.aggregate({
      where: {
        userId: connection.userId,
        amountDueCents: { gt: 0 },
      },
      _sum: { amountDueCents: true },
    })

    const detectedFindings = detectSpendFindings({
      bills: spendSync.spendBills.map((bill) => ({
        sourceId: bill.providerBillId,
        supplierName: bill.supplierName,
        amountCents: Math.abs(toCents(bill.amountTotal)),
        dueDate: bill.dueDate ?? null,
        paidDate: bill.paidDate ?? null,
        status: bill.status,
        sourceUpdatedAt: bill.providerUpdatedAt ?? null,
      })),
      bankTransactions: spendSync.spendTransactions.map((tx) => ({
        sourceId: tx.providerTransactionId,
        description: tx.description,
        amountCents: toCents(tx.amount),
        transactionDate: tx.transactionDate,
        counterpartyName: tx.counterpartyName ?? null,
      })),
      suppliers: spendSync.spendSuppliers.map((supplier) => ({
        sourceId: supplier.providerSupplierId,
        supplierName: supplier.supplierName,
      })),
      currentCashCents: latestCashSnapshot?.currentCashCents,
      openReceivablesCents: openReceivables._sum.amountDueCents ?? 0,
      now: syncStartedAt,
    })

    try {
      await persistSpendFindings({
        userId: connection.userId,
        accountingConnectionId: connection.id,
        findings: detectedFindings,
      })
    } catch (err) {
      result.invoicesSkipped += 1
      const failureSummary = `spend-findings:${err instanceof Error ? err.message : "unknown error"}`
      result.errorMessage = result.errorMessage ? `${result.errorMessage}; ${failureSummary}` : failureSummary
    }

    if (spendSync.failures.length > 0) {
      const failureSummary = `Spend sync partial: ${spendSync.failures.slice(0, 3).join(" | ")}`
      result.errorMessage = result.errorMessage ? `${result.errorMessage}; ${failureSummary}` : failureSummary
      result.invoicesSkipped += spendSync.failures.length
    }

    result.status = result.invoicesSkipped > 0 ? "partial" : "success"

    // --- Update connection lastSyncedAt and, if this was the first
    // successful sync (or a recovery from 'error'), promote status to 'active' ---
    const nextStatus = resolveConnectionStatusAfterSync(connection.status, result.status)
    await prismaAdmin.accountingConnection.update({
      where: { id: connectionId },
      data: {
        lastSyncedAt: syncStartedAt,
        ...(nextStatus ? { status: nextStatus } : {}),
      },
    })
  } catch (err) {
    const errorKind = err instanceof AccountingProviderError ? err.kind : undefined

    if (errorKind === "unauthorized") {
      result.errorMessage = "Access token revoked — user must reconnect"
    } else if (errorKind === "rate_limited") {
      result.errorMessage = `Rate limited by ${connection.provider} — will retry next cycle`
    } else {
      result.errorMessage = err instanceof Error ? err.message : "Unknown error"
    }
    result.status = "failed"

    // Mark the connection deterministically: revoked on auth failure, or
    // 'error' if this was still an unproven first sync. An already-active
    // connection stays active — the failed run is recorded above.
    const nextStatus = resolveConnectionStatusAfterSync(connection.status, "failed", errorKind)
    if (nextStatus) {
      await prismaAdmin.accountingConnection.update({
        where: { id: connectionId },
        data: { status: nextStatus },
      })
    }
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
  const sourceSystem = connection.provider as "xero" | "myob"

  // Determine TrackedInvoice status from provider status
  const invoiceStatus = mapProviderStatusToTracked(inv.status)

  // Upsert the canonical contact (provenance absorbs the old
  // ProviderContactMapping), then the canonical invoice keyed by
  // (userId, sourceSystem, sourceId).
  let financialContactId: string | null = null
  if (clientEmail || inv.providerContactId) {
    const canonicalContact = await upsertFinancialContact(prismaAdmin, {
      userId: connection.userId,
      sourceSystem,
      sourceId: inv.providerContactId || `email:${clientEmail.trim().toLowerCase()}`,
      accountingConnectionId: connection.id,
      sourceUpdatedAt: contact?.rawMetadata != null ? inv.providerUpdatedAt ?? null : null,
      name: clientName || clientEmail || "Unknown contact",
      email: clientEmail || null,
      rawSourceData: contact?.rawMetadata ?? null,
    })
    financialContactId = canonicalContact.id
  }

  const { invoice: financialInvoice, created } = await upsertFinancialInvoice(prismaAdmin, {
    userId: connection.userId,
    sourceSystem,
    sourceId: inv.providerInvoiceId,
    accountingConnectionId: connection.id,
    sourceUpdatedAt: inv.providerUpdatedAt ?? null,
    contactId: financialContactId,
    invoiceNumber: inv.invoiceNumber ?? null,
    amountDueCents: toCents(inv.amountDue),
    currency: inv.currency,
    dueDate: inv.dueDate,
    rawSourceData: inv.rawMetadata ?? null,
  })

  // Link chasing preferences (Customer) to the canonical contact.
  const customer = clientEmail
    ? await findOrCreateCustomer(
        prismaAdmin,
        connection.userId,
        clientEmail,
        clientName,
        sourceSystem,
        inv.providerContactId || undefined,
      )
    : null

  if (created) {
    await prismaAdmin.trackedInvoice.create({
      data: {
        userId: connection.userId,
        financialInvoiceId: financialInvoice.id,
        invoiceConnectionId,
        customerId: customer?.id,
        status: invoiceStatus,
        currentStage: 0,
        // Only schedule reminders for open invoices
        nextEmailAt: invoiceStatus === "pending" ? inv.dueDate : null,
        providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })
    result.invoicesCreated++
  } else {
    const existing = await prismaAdmin.trackedInvoice.findUnique({
      where: { financialInvoiceId: financialInvoice.id },
      select: { id: true, status: true },
    })
    if (!existing) {
      // Canonical invoice existed but had no chasing record yet — enrol it.
      await prismaAdmin.trackedInvoice.create({
        data: {
          userId: connection.userId,
          financialInvoiceId: financialInvoice.id,
          invoiceConnectionId,
          customerId: customer?.id,
          status: invoiceStatus,
          currentStage: 0,
          nextEmailAt: invoiceStatus === "pending" ? inv.dueDate : null,
          providerMetadata: inv.rawMetadata != null ? (inv.rawMetadata as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      })
      result.invoicesCreated++
      return
    }

    // Update existing chasing record: invoice facts live on the canonical
    // record (already upserted above); here we only advance workflow state.
    const wasOpen = existing.status === "pending"
    const nowClosed = invoiceStatus === "paid" || invoiceStatus === "manually_resolved"

    await prismaAdmin.trackedInvoice.update({
      where: { id: existing.id },
      data: {
        ...(customer ? { customerId: customer.id } : {}),
        status: invoiceStatus,
        // Cancel reminders when invoice transitions to paid/voided
        ...(wasOpen && nowClosed ? { nextEmailAt: null, currentStage: 0 } : {}),
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
 * Sync all connections in a syncable state (active, pending first sync, or
 * previously errored) so that a stalled first sync or a transient failure is
 * retried automatically on the next cron run.
 * Called by the cron job. Errors in individual connections do not stop others.
 */
export async function syncAllActiveConnections(): Promise<SyncResult[]> {
  const connections = await prismaAdmin.accountingConnection.findMany({
    where: { status: { in: Array.from(SYNCABLE_STATUSES) } },
    select: { id: true, organisationId: true },
  })

  const results: SyncResult[] = []
  for (const conn of connections) {
    // Skip development seed connections before any provider call is attempted.
    if (isDemoOrganisationId(conn.organisationId)) continue

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
        spendBillsUpserted: 0,
        spendTransactionsUpserted: 0,
        spendSuppliersUpserted: 0,
        errorMessage: "Unexpected error",
      })
    }
  }

  return results
}

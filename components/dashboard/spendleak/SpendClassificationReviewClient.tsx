"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"

import { Spinner } from "@/components/ui/Spinner"

const PAGE_SIZE = 25

type Category = { id: string; name: string; status: string; isSystem: boolean; key: string | null }
type ReviewSource = {
  type: "imported_bill" | "imported_bank_transaction"
  recordId: string
  merchantName: string | null
  description?: string
  reference?: string | null
  direction: "outflow" | "inflow" | "unknown"
  amountCents: number
  currency: string
  status?: string
  transactionDate: string | null
  expenseAccountCode: string | null
  expenseAccountName: string | null
  accountingProvider: string
  accountingOrganisation: string
}
type ReviewItem = {
  id: string
  source: ReviewSource | null
  status: string
  origin: string | null
  category: { id: string; name: string; status: string } | null
  confidence: number | null
  probabilities: unknown
  model: string | null
  lastErrorCode: string | null
  attemptCount: number
  updatedAt: string
  refundForClassificationId: string | null
  refundFor: {
    id: string
    sourceType: string
    merchantName: string | null
    description: string | null
    amountCents: number | null
    currency: string | null
    category: { id: string; name: string } | null
  } | null
  matchedRule: { id: string; name: string; ruleType: string; matchCriteria: Record<string, string> | null } | null
}
type ReviewResponse = { items: ReviewItem[] }
type RefundCandidate = {
  id: string
  sourceType: "imported_bill" | "imported_bank_transaction"
  merchantName: string | null
  description: string | null
  amountCents: number
  remainingCents: number
  currency: string
  category: { id: string; name: string } | null
}

type FutureRuleDraft =
  | { ruleType: "merchant"; merchantName: string }
  | { ruleType: "text_match"; phrase: string }

const REVIEW_FILTERS = [
  { value: "needs_review", label: "Needs review" },
  { value: "suggested", label: "Suggestions" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "excluded", label: "Excluded" },
] as const

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(Math.abs(amountCents) / 100)
  } catch {
    return `${currency.toUpperCase()} ${(Math.abs(amountCents) / 100).toFixed(2)}`
  }
}

function formatDirection(direction: ReviewSource["direction"]): string {
  if (direction === "outflow") return "Outflow"
  if (direction === "inflow") return "Inflow"
  return "Direction unknown"
}

function formatOrigin(origin: string | null): string {
  if (origin === "source_mapping") return "Source-account mapping"
  if (origin === "rule") return "Tenant rule"
  if (origin === "jev") return "Jev suggestion"
  if (origin === "manual") return "Manually confirmed"
  return "Unclassified"
}

function formatRuleCriteria(rule: ReviewItem["matchedRule"]): string | null {
  if (!rule?.matchCriteria) return null
  const criteria = rule.matchCriteria
  if (rule.ruleType === "source_account") {
    if (criteria.accountCode) return `Expense account code ${criteria.accountCode}`
    if (criteria.accountName) return `Expense account name ${criteria.accountName}`
  }
  if (rule.ruleType === "merchant" && criteria.merchantName) return `Exact merchant match: ${criteria.merchantName}`
  if (rule.ruleType === "text_match" && criteria.phrase) return `Description contains “${criteria.phrase}”`
  return null
}

async function responseError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error
  return "request_failed"
}

export function SpendClassificationReviewClient() {
  const [items, setItems] = useState<ReviewItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<string>("needs_review")
  const [offset, setOffset] = useState(0)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkCategoryId, setBulkCategoryId] = useState("")
  const [categoryByItem, setCategoryByItem] = useState<Record<string, string>>({})
  const [reasonByItem, setReasonByItem] = useState<Record<string, string>>({})
  const [ruleEnabledByItem, setRuleEnabledByItem] = useState<Record<string, boolean>>({})
  const [ruleTypeByItem, setRuleTypeByItem] = useState<Record<string, "merchant" | "text_match">>({})
  const [ruleCriteriaByItem, setRuleCriteriaByItem] = useState<Record<string, string>>({})
  const [refundCandidatesByItem, setRefundCandidatesByItem] = useState<Record<string, RefundCandidate[]>>({})
  const [refundTargetByItem, setRefundTargetByItem] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadData = useCallback(async (nextOffset: number, nextFilter: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) })
      if (nextFilter) query.set("status", nextFilter)
      const [reviewResponse, categoriesResponse] = await Promise.all([
        fetch(`/api/spend-classification/review?${query.toString()}`),
        fetch("/api/spend-classification/categories"),
      ])
      if (!reviewResponse.ok) throw new Error("Unable to load imported-spend review.")
      if (!categoriesResponse.ok) throw new Error("Unable to load category choices.")
      const reviewBody = await reviewResponse.json() as ReviewResponse
      const categoryBody = await categoriesResponse.json() as { categories: Category[] }
      setItems(reviewBody.items)
      setCategories(categoryBody.categories)
      setSelectedIds([])
      setOffset(nextOffset)
      setCategoryByItem((current) => {
        const next = { ...current }
        for (const item of reviewBody.items) next[item.id] = item.category?.id ?? ""
        return next
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load imported-spend review.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    async function loadInitialData(): Promise<void> {
      await loadData(0, "needs_review")
    }
    void loadInitialData()
  }, [loadData])

  function toggleSelected(id: string): void {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])
  }

  async function correctItem(event: FormEvent<HTMLFormElement>, item: ReviewItem): Promise<void> {
    event.preventDefault()
    const categoryId = categoryByItem[item.id]
    if (!categoryId) {
      setError("Choose a category before confirming this item.")
      return
    }
    const wantsRule = ruleEnabledByItem[item.id] === true
    const criteria = ruleCriteriaByItem[item.id]?.trim() ?? ""
    if (wantsRule && !criteria) {
      setError("Enter explicit match criteria for the future rule.")
      return
    }
    const createRule: FutureRuleDraft | undefined = wantsRule
      ? ruleTypeByItem[item.id] === "text_match"
        ? { ruleType: "text_match", phrase: criteria }
        : { ruleType: "merchant", merchantName: criteria }
      : undefined

    setSavingId(item.id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/spend-classification/review/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          ...(reasonByItem[item.id]?.trim() ? { reason: reasonByItem[item.id].trim() } : {}),
          ...(createRule ? { createRule } : {}),
        }),
      })
      if (!response.ok) {
        const code = await responseError(response)
        throw new Error(code === "category_not_active" ? "That category is no longer active. Refresh and choose another." : "Unable to save this correction. Please try again.")
      }
      setNotice(createRule ? "Correction saved. The rule applies only to source records first imported from now on." : "Classification confirmed.")
      await loadData(offset, filter)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save this correction.")
    } finally {
      setSavingId(null)
    }
  }

  async function confirmBulk(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (selectedIds.length === 0) {
      setError("Select at least one item to confirm.")
      return
    }
    if (!bulkCategoryId) {
      setError("Choose one category for the selected items.")
      return
    }
    setBulkSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/spend-classification/review/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classificationIds: selectedIds, categoryId: bulkCategoryId }),
      })
      if (!response.ok) throw new Error("Unable to confirm the selected items. Refresh and try again.")
      const result = await response.json() as { classifications: Array<{ id: string }> }
      setNotice(`${result.classifications.length} selected item${result.classifications.length === 1 ? "" : "s"} confirmed. No future rule was created.`)
      await loadData(offset, filter)
    } catch (bulkError) {
      setError(bulkError instanceof Error ? bulkError.message : "Unable to confirm selected items.")
    } finally {
      setBulkSaving(false)
    }
  }

  async function loadRefundCandidates(item: ReviewItem): Promise<void> {
    if (refundCandidatesByItem[item.id]) return
    try {
      const response = await fetch(`/api/spend-classification/review/${encodeURIComponent(item.id)}`)
      if (!response.ok) throw new Error("Unable to load possible original spend records.")
      const body = await response.json() as { candidates: RefundCandidate[] }
      setRefundCandidatesByItem((current) => ({ ...current, [item.id]: body.candidates }))
      if (body.candidates.length === 1) setRefundTargetByItem((current) => ({ ...current, [item.id]: body.candidates[0].id }))
    } catch (candidateError) {
      setError(candidateError instanceof Error ? candidateError.message : "Unable to load possible original spend records.")
    }
  }

  async function saveSpecialAction(item: ReviewItem, action: Record<string, string>): Promise<void> {
    setSavingId(item.id)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/spend-classification/review/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      })
      if (!response.ok) {
        const code = await responseError(response)
        const message = code === "refund_exceeds_original"
          ? "The refund exceeds the original spend’s remaining unrefunded amount."
          : code === "refund_currency_mismatch"
            ? "Refund and original spend must use the same currency."
            : code === "transfer_has_linked_refunds"
              ? "Unlink refunds before marking this transaction as a transfer."
              : "Unable to save this review action. Check the source and try again."
        throw new Error(message)
      }
      setNotice(action.action === "mark_transfer" ? "Transaction excluded as an internal transfer." : action.action === "link_refund" ? "Refund linked to the original spend." : "Refund link removed; the record remains in review.")
      await loadData(offset, filter)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to save this review action.")
    } finally {
      setSavingId(null)
    }
  }

  const activeCategories = categories.filter((category) => category.status === "active")
  const hasNextPage = items.length === PAGE_SIZE

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="classification-review-filter" className="mb-1 block text-sm font-medium text-gray-700">Show</label>
          <select id="classification-review-filter" value={filter} onChange={(event) => { const nextFilter = event.target.value; setFilter(nextFilter); setOffset(0); void loadData(0, nextFilter) }} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
            {REVIEW_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            <option value="">All statuses</option>
          </select>
        </div>
        <p className="text-sm text-gray-600" aria-live="polite">Showing {items.length ? offset + 1 : 0}–{offset + items.length} records</p>
      </div>

      {selectedIds.length > 0 ? (
        <form onSubmit={(event) => void confirmBulk(event)} className="flex flex-wrap items-end gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="basis-full text-sm font-medium text-blue-950">{selectedIds.length} explicitly selected record{selectedIds.length === 1 ? "" : "s"}</p>
          <div className="min-w-48 flex-1">
            <label htmlFor="bulk-confirm-category" className="mb-1 block text-sm font-medium text-gray-700">Confirm all as</label>
            <select id="bulk-confirm-category" value={bulkCategoryId} onChange={(event) => setBulkCategoryId(event.target.value)} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
              <option value="">Choose an active category</option>
              {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={bulkSaving} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">{bulkSaving ? "Confirming…" : "Confirm selected"}</button>
          <button type="button" onClick={() => setSelectedIds([])} disabled={bulkSaving} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">Clear selection</button>
          <p className="basis-full text-xs text-gray-600">This action records a separate audit event for each selected record. It does not create a future rule.</p>
        </form>
      ) : null}

      {loading ? <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-6"><Spinner /><span className="text-sm text-gray-600">Loading imported-spend records…</span></div> : null}
      {!loading && error && items.length === 0 ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
      {!loading && !error && items.length === 0 ? <div className="rounded-xl border border-gray-200 bg-white p-6"><h2 className="font-semibold text-gray-900">No records in this view</h2><p className="mt-1 text-sm text-gray-600">Try another status filter or check again after your accounting data syncs.</p></div> : null}

      {!loading ? items.map((item) => {
        const source = item.source
        const ruleCriteria = formatRuleCriteria(item.matchedRule)
        const selected = selectedIds.includes(item.id)
        const ruleType = ruleTypeByItem[item.id] ?? "merchant"
        const criteriaId = `future-rule-criteria-${item.id}`
        return (
          <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start gap-3">
              <label className="flex items-center gap-2 pt-1 text-sm text-gray-700">
                <input type="checkbox" checked={selected} disabled={item.origin === "manual"} onChange={() => toggleSelected(item.id)} aria-label={`Select ${source?.merchantName ?? source?.description ?? "imported record"} for bulk confirmation`} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                <span className="sr-only">Select for bulk confirmation</span>
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-gray-900">{source?.merchantName || "Unspecified merchant"}</h2>
                    {source?.description ? <p className="mt-1 text-sm text-gray-700">{source.description}</p> : null}
                    {source?.reference ? <p className="mt-1 text-xs text-gray-500">Source reference: {source.reference}</p> : null}
                  </div>
                  {source ? <div className="text-left sm:text-right"><p className="font-semibold text-gray-900">{formatMoney(source.amountCents, source.currency)}</p><p className="text-sm text-gray-600">{formatDirection(source.direction)}</p></div> : null}
                </div>

                {source ? (
                  <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div><dt className="text-gray-500">Imported source</dt><dd className="font-medium text-gray-800">{source.type === "imported_bill" ? "Bill" : "Bank transaction"} · internal record {source.recordId}</dd></div>
                    <div><dt className="text-gray-500">Accounting connection</dt><dd className="font-medium text-gray-800">{source.accountingProvider.toUpperCase()} · {source.accountingOrganisation}</dd></div>
                    <div><dt className="text-gray-500">Source date</dt><dd className="font-medium text-gray-800">{source.transactionDate ? new Date(source.transactionDate).toLocaleDateString() : "Not available"}</dd></div>
                    {source.expenseAccountCode || source.expenseAccountName ? <div><dt className="text-gray-500">Verified expense account</dt><dd className="font-medium text-gray-800">{[source.expenseAccountCode, source.expenseAccountName].filter(Boolean).join(" · ")}</dd></div> : null}
                  </dl>
                ) : <p className="mt-3 text-sm text-amber-800">The imported source is no longer available.</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">Status: {item.status.replaceAll("_", " ")}</span>
                  <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-medium text-indigo-800">Origin: {formatOrigin(item.origin)}</span>
                  {item.category ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">Category: {item.category.name}{item.category.status !== "active" ? ` (${item.category.status})` : ""}</span> : null}
                  {item.origin === "jev" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-900">Unconfirmed Jev suggestion</span> : null}
                </div>
                {item.origin === "manual" ? <p className="mt-2 text-xs text-gray-600">This record was manually confirmed and cannot be changed through bulk confirmation.</p> : null}
                {item.origin === "jev" && item.confidence !== null ? <p className="mt-2 text-sm text-gray-600">Jev-reported confidence: {(item.confidence * 100).toFixed(0)}% <span className="text-gray-500">(not a guarantee of correctness)</span></p> : null}
                {item.origin === "jev" && item.probabilities && typeof item.probabilities === "object" ? <p className="mt-1 text-xs text-gray-500">Jev returned category probabilities. Review the suggestion; no rationale was provided.</p> : null}
                {item.model ? <p className="mt-1 text-xs text-gray-500">Model: {item.model}</p> : null}
                {item.matchedRule ? <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm"><p className="font-medium text-blue-950">Matched {item.matchedRule.ruleType === "source_account" ? "source-account mapping" : "rule"}: {item.matchedRule.name}</p><p className="mt-1 text-blue-900">{ruleCriteria ?? "Match details unavailable."}</p><p className="mt-1 text-xs text-blue-800">Rule ID: {item.matchedRule.id}</p></div> : null}

                {item.refundFor ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                    <p className="text-blue-950">Linked refund to {item.refundFor.category?.name ?? "original spend"}: {item.refundFor.merchantName ?? item.refundFor.description ?? "Imported source"} · {item.refundFor.sourceType === "imported_bill" ? "bill" : "bank transaction"} · {item.refundFor.currency ?? ""}</p>
                    <button type="button" onClick={() => void saveSpecialAction(item, { action: "unlink_refund" })} disabled={savingId === item.id} className="rounded-md border border-blue-300 bg-white px-3 py-2 font-medium text-blue-800 disabled:opacity-50">Unlink refund</button>
                  </div>
                ) : null}

                {source?.type === "imported_bank_transaction" && source.direction === "inflow" && !item.refundFor ? (
                  <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" onToggle={(event) => { if (event.currentTarget.open) void loadRefundCandidates(item) }}>
                    <summary className="cursor-pointer text-sm font-medium text-amber-950">Link this inflow to an original spend (optional)</summary>
                    <p className="mt-2 text-sm text-amber-900">Only link when you can verify the original spend. The link cannot exceed the original’s remaining amount and must use the same currency.</p>
                    {refundCandidatesByItem[item.id] ? refundCandidatesByItem[item.id].length > 0 ? (
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <div className="min-w-64 flex-1">
                          <label htmlFor={`refund-target-${item.id}`} className="mb-1 block text-sm font-medium text-gray-700">Original confirmed spend</label>
                          <select id={`refund-target-${item.id}`} value={refundTargetByItem[item.id] ?? ""} onChange={(event) => setRefundTargetByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                            <option value="">Choose original spend</option>
                            {refundCandidatesByItem[item.id].map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.category?.name ?? "Category"} · {candidate.merchantName ?? candidate.description ?? "Imported source"} · {candidate.sourceType === "imported_bill" ? "bill" : "bank transaction"} · {formatMoney(candidate.remainingCents, candidate.currency)} remaining</option>)}
                          </select>
                        </div>
                        <button type="button" disabled={!refundTargetByItem[item.id] || savingId === item.id} onClick={() => void saveSpecialAction(item, { action: "link_refund", originalClassificationId: refundTargetByItem[item.id] })} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingId === item.id ? "Saving…" : "Link refund"}</button>
                      </div>
                    ) : <p className="mt-3 text-sm text-gray-700">No confirmed, same-currency outflow with enough unrefunded value was found. This inflow remains reviewable.</p> : <p className="mt-3 text-sm text-gray-700">Loading eligible original spend…</p>}
                  </details>
                ) : null}

                {source?.type === "imported_bank_transaction" && item.status !== "excluded" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 p-3">
                    <p className="flex-1 text-sm text-gray-700">If this is an internal account transfer, exclude it without assigning a spending category.</p>
                    <button type="button" onClick={() => void saveSpecialAction(item, { action: "mark_transfer", reason: "User identified an internal transfer." })} disabled={savingId === item.id} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 disabled:opacity-50">{savingId === item.id ? "Saving…" : "Mark as internal transfer"}</button>
                  </div>
                ) : null}

                <form onSubmit={(event) => void correctItem(event, item)} className="mt-5 grid gap-3 border-t border-gray-100 pt-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor={`category-choice-${item.id}`} className="mb-1 block text-sm font-medium text-gray-700">Confirm or correct category</label>
                      <select id={`category-choice-${item.id}`} value={categoryByItem[item.id] ?? ""} onChange={(event) => setCategoryByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                        <option value="">Choose an active category</option>
                        {activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`correction-reason-${item.id}`} className="mb-1 block text-sm font-medium text-gray-700">Reason (optional)</label>
                      <input id={`correction-reason-${item.id}`} value={reasonByItem[item.id] ?? ""} maxLength={500} onChange={(event) => setReasonByItem((current) => ({ ...current, [item.id]: event.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                  </div>

                  <details className="rounded-lg border border-gray-200 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-800">Create an explicit rule for future records (optional)</summary>
                    <p className="mt-2 text-sm text-gray-600">This rule affects source records first imported after it is created. Existing imports will not be changed by it, including on later syncs.</p>
                    <label htmlFor={`create-future-rule-${item.id}`} className="mt-3 flex items-start gap-2 text-sm text-gray-800">
                      <input id={`create-future-rule-${item.id}`} type="checkbox" checked={ruleEnabledByItem[item.id] ?? false} onChange={(event) => setRuleEnabledByItem((current) => ({ ...current, [item.id]: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span>Yes, create a tenant rule for future records</span>
                    </label>
                    {ruleEnabledByItem[item.id] ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`future-rule-type-${item.id}`} className="mb-1 block text-sm font-medium text-gray-700">Match type</label>
                          <select id={`future-rule-type-${item.id}`} value={ruleType} onChange={(event) => setRuleTypeByItem((current) => ({ ...current, [item.id]: event.target.value as "merchant" | "text_match" }))} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                            <option value="merchant">Exact merchant</option>
                            <option value="text_match">Description phrase</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor={criteriaId} className="mb-1 block text-sm font-medium text-gray-700">{ruleType === "merchant" ? "Merchant name" : "Literal description phrase"}</label>
                          <input id={criteriaId} value={ruleCriteriaByItem[item.id] ?? (ruleType === "merchant" ? source?.merchantName ?? "" : "")} onChange={(event) => setRuleCriteriaByItem((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={160} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                      </div>
                    ) : null}
                  </details>

                  <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={savingId === item.id || activeCategories.length === 0} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">{savingId === item.id ? "Saving…" : "Save correction"}</button>
                    <span className="text-xs text-gray-500">Manual confirmation is kept separate from the imported accounting record.</span>
                  </div>
                </form>
              </div>
            </div>
          </article>
        )
      }) : null}

      {!loading && (offset > 0 || hasNextPage) ? (
        <nav aria-label="Imported spend review pages" className="flex items-center justify-between gap-3">
          <button type="button" disabled={loading || offset === 0} onClick={() => void loadData(Math.max(0, offset - PAGE_SIZE), filter)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Previous</button>
          <span className="text-sm text-gray-600">Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button type="button" disabled={loading || !hasNextPage} onClick={() => void loadData(offset + PAGE_SIZE, filter)} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">Next</button>
        </nav>
      ) : null}

      {error && items.length > 0 ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
    </div>
  )
}

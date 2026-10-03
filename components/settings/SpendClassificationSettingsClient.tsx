"use client"

import { useEffect, useState, type FormEvent } from "react"

import { Spinner } from "@/components/ui/Spinner"

const MAX_ACTIVE_CATEGORIES = 255

type Category = {
  id: string
  key: string | null
  name: string
  description: string | null
  isSystem: boolean
  status: string
  mergedIntoCategoryId: string | null
  createdAt: string
  updatedAt: string
}

type ClassificationSettings = { enabled: boolean }

function messageForApiError(code: string): string {
  switch (code) {
    case "category_name_required": return "Enter a category name."
    case "category_name_taken": return "A category with that name already exists."
    case "category_limit_reached": return "The active category limit of 255 has been reached. Retire a category before adding another."
    case "category_not_found": return "That category is no longer available. Refresh and try again."
    case "category_reserved": return "The reserved Other category cannot be changed."
    case "category_not_active": return "Only active categories can be changed or selected as a merge target."
    case "category_merge_self": return "Choose a different category as the merge target."
    default: return "Something went wrong. Please try again."
  }
}

async function readErrorCode(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
    return body.error
  }
  return "request_failed"
}

export function SpendClassificationSettingsClient() {
  const [categories, setCategories] = useState<Category[]>([])
  const [enabled, setEnabled] = useState(false)
  const [enabledDraft, setEnabledDraft] = useState(false)
  const [newName, setNewName] = useState("")
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [categoryActionError, setCategoryActionError] = useState<string | null>(null)
  const [mergingCategoryId, setMergingCategoryId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [createCategoryError, setCreateCategoryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const [categoryResponse, settingsResponse] = await Promise.all([
          fetch("/api/spend-classification/categories"),
          fetch("/api/spend-classification/settings"),
        ])
        if (!categoryResponse.ok) throw new Error(messageForApiError(await readErrorCode(categoryResponse)))
        if (!settingsResponse.ok) throw new Error("Unable to load external-processing settings.")
        const categoryBody = await categoryResponse.json() as { categories: Category[] }
        const settingsBody = await settingsResponse.json() as ClassificationSettings
        if (!active) return
        setCategories(categoryBody.categories)
        setEnabled(settingsBody.enabled)
        setEnabledDraft(settingsBody.enabled)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load classification settings.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function saveExternalSetting(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSavedMessage(null)
    try {
      const response = await fetch("/api/spend-classification/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: enabledDraft }),
      })
      if (!response.ok) throw new Error("Unable to save the external-processing choice. Please try again.")
      const result = await response.json() as ClassificationSettings
      setEnabled(result.enabled)
      setEnabledDraft(result.enabled)
      setSavedMessage("External-processing settings saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the external-processing choice.")
    } finally {
      setSaving(false)
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const name = newName.trim()
    if (!name) {
      setCreateCategoryError("Enter a category name.")
      return
    }
    setSaving(true)
    setCreateCategoryError(null)
    setError(null)
    setSavedMessage(null)
    try {
      const response = await fetch("/api/spend-classification/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) throw new Error(messageForApiError(await readErrorCode(response)))
      const result = await response.json() as { category: Category }
      setCategories((current) => [...current, result.category])
      setNewName("")
      setSavedMessage("Category added.")
    } catch (createError) {
      setCreateCategoryError(createError instanceof Error ? createError.message : "Unable to add category.")
    } finally {
      setSaving(false)
    }
  }

  async function updateCategory(categoryId: string, body: { action: "rename"; name: string } | { action: "retire" } | { action: "merge"; targetCategoryId: string }): Promise<void> {
    setSaving(true)
    setCategoryActionError(null)
    setError(null)
    setSavedMessage(null)
    try {
      const response = await fetch(`/api/spend-classification/categories/${encodeURIComponent(categoryId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(messageForApiError(await readErrorCode(response)))
      const result = await response.json() as { category: Category }
      setCategories((current) => current.map((category) => category.id === result.category.id ? result.category : category))
      setEditingCategoryId(null)
      setMergingCategoryId(null)
      setSavedMessage(body.action === "rename" ? "Category renamed." : body.action === "retire" ? "Category retired." : "Categories merged.")
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Unable to update category."
      if (body.action === "rename" || body.action === "merge") setCategoryActionError(message)
      else setError(message)
    } finally {
      setSaving(false)
    }
  }

  async function retireCategory(category: Category): Promise<void> {
    const confirmed = window.confirm(`Retire “${category.name}”? Existing assignments remain available in historical views.`)
    if (confirmed) await updateCategory(category.id, { action: "retire" })
  }

  async function handleRename(event: FormEvent<HTMLFormElement>, categoryId: string): Promise<void> {
    event.preventDefault()
    const name = editingName.trim()
    if (!name) {
      setCategoryActionError("Enter a category name.")
      return
    }
    await updateCategory(categoryId, { action: "rename", name })
  }

  async function handleMerge(event: FormEvent<HTMLFormElement>, category: Category): Promise<void> {
    event.preventDefault()
    if (!mergeTargetId) {
      setCategoryActionError("Choose an active category to receive this category's historical assignments.")
      return
    }
    const target = categories.find((item) => item.id === mergeTargetId)
    if (!target) {
      setCategoryActionError("Choose an active merge target.")
      return
    }
    const confirmed = window.confirm(`Merge “${category.name}” into “${target.name}”? The source category will remain linked for historical reporting.`)
    if (confirmed) await updateCategory(category.id, { action: "merge", targetCategoryId: target.id })
  }

  if (loading) {
    return <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-6"><Spinner /><span className="text-sm text-gray-600">Loading classification settings…</span></div>
  }

  if (error && categories.length === 0) {
    return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
  }

  const activeCategories = categories.filter((category) => category.status === "active")
  const historicalCategories = categories.filter((category) => category.status !== "active")

  return (
    <div className="space-y-6">
      <section aria-labelledby="classification-categories-heading" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="classification-categories-heading" className="text-base font-semibold text-gray-900">Spending categories</h3>
            <p className="mt-1 text-sm text-gray-600">Categories organize imported spend for analysis. Changes here do not update Xero, MYOB, or your source records.</p>
          </div>
          <p className="text-sm font-medium text-gray-700" aria-live="polite">{activeCategories.length} / {MAX_ACTIVE_CATEGORIES} active</p>
        </div>

        <ul className="mt-4 divide-y divide-gray-100">
          {activeCategories.map((category) => {
            const reserved = category.isSystem && category.key === "other"
            return (
              <li key={category.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{category.name}{reserved ? <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Reserved</span> : null}</h4>
                    {reserved ? <p className="mt-1 text-sm text-gray-600">Fallback category; it must remain active and cannot be renamed, retired, or merged.</p> : null}
                  </div>
                  {!reserved ? (
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setEditingCategoryId(category.id); setEditingName(category.name); setMergingCategoryId(null); setCategoryActionError(null); setError(null) }} aria-label={`Rename ${category.name}`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Rename</button>
                      <button type="button" onClick={() => { setMergingCategoryId(category.id); setMergeTargetId(""); setEditingCategoryId(null); setCategoryActionError(null); setError(null) }} aria-label={`Merge ${category.name}`} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Merge</button>
                      <button type="button" onClick={() => void retireCategory(category)} disabled={saving} aria-label={`Retire ${category.name}`} className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Retire</button>
                    </div>
                  ) : null}
                </div>

                {editingCategoryId === category.id ? (
                  <form onSubmit={(event) => void handleRename(event, category.id)} className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-48 flex-1">
                      <label htmlFor={`category-name-${category.id}`} className="mb-1 block text-sm font-medium text-gray-700">Category name</label>
                      <input id={`category-name-${category.id}`} value={editingName} maxLength={100} aria-invalid={categoryActionError ? true : undefined} aria-describedby={categoryActionError ? `category-edit-error-${category.id}` : undefined} onChange={(event) => { setEditingName(event.target.value); setCategoryActionError(null) }} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                      {categoryActionError ? <p id={`category-edit-error-${category.id}`} className="mt-1 text-sm text-red-700" role="alert">{categoryActionError}</p> : null}
                    </div>
                    <button type="submit" disabled={saving} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save name"}</button>
                    <button type="button" onClick={() => setEditingCategoryId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
                  </form>
                ) : null}

                {mergingCategoryId === category.id ? (
                  <form onSubmit={(event) => void handleMerge(event, category)} className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-48 flex-1">
                      <label htmlFor={`merge-target-${category.id}`} className="mb-1 block text-sm font-medium text-gray-700">Merge into active category</label>
                      <select id={`merge-target-${category.id}`} value={mergeTargetId} aria-invalid={categoryActionError ? true : undefined} aria-describedby={categoryActionError ? `category-merge-error-${category.id}` : undefined} onChange={(event) => { setMergeTargetId(event.target.value); setCategoryActionError(null) }} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                        <option value="">Choose a category</option>
                        {activeCategories.filter((target) => target.id !== category.id).map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                      {categoryActionError ? <p id={`category-merge-error-${category.id}`} className="mt-1 text-sm text-red-700" role="alert">{categoryActionError}</p> : null}
                    </div>
                    <button type="submit" disabled={saving || activeCategories.length < 2} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Merge categories"}</button>
                    <button type="button" onClick={() => setMergingCategoryId(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">Cancel</button>
                    <p className="basis-full text-xs text-gray-600">The source category remains in history and links to the selected target; past assignments are not rewritten.</p>
                  </form>
                ) : null}
              </li>
            )
          })}
        </ul>

        <form onSubmit={(event) => void createCategory(event)} className="mt-6 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-5">
          <div className="min-w-48 flex-1">
            <label htmlFor="new-spend-category" className="mb-1 block text-sm font-medium text-gray-700">Add a category</label>
            <input id="new-spend-category" value={newName} maxLength={100} aria-invalid={createCategoryError ? true : undefined} aria-describedby={createCategoryError ? "new-spend-category-error" : undefined} onChange={(event) => { setNewName(event.target.value); setCreateCategoryError(null) }} placeholder="e.g. Cloud Hosting" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200" />
            {createCategoryError ? <p id="new-spend-category-error" className="mt-1 text-sm text-red-700" role="alert">{createCategoryError}</p> : null}
          </div>
          <button type="submit" disabled={saving || activeCategories.length >= MAX_ACTIVE_CATEGORIES} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Add category"}</button>
        </form>

        {historicalCategories.length > 0 ? (
          <details className="mt-5 border-t border-gray-100 pt-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Retired and merged categories ({historicalCategories.length})</summary>
            <ul className="mt-3 space-y-2">
              {historicalCategories.map((category) => (
                <li key={category.id} className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <span className="font-medium">{category.name}</span> <span className="text-gray-500">({category.status})</span>
                  {category.mergedIntoCategoryId ? <span className="text-gray-500"> — linked to {categories.find((item) => item.id === category.mergedIntoCategoryId)?.name ?? "another category"}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="jev-opt-in-heading" className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h3 id="jev-opt-in-heading" className="text-base font-semibold text-gray-900">External classification with Jev</h3>
        <p className="mt-1 text-sm text-gray-600">Jev suggestions are optional and always require your confirmation. Your choice is off by default.</p>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h4 className="font-semibold">Before you opt in</h4>
          <p className="mt-2">For unresolved transactions, PaidSoon may send TypeSafe in the United States a minimized description, merchant name when available, direction, currency, and your active category labels and descriptions.</p>
          <p className="mt-2">Source IDs, contact details, references, exact amounts, and raw provider payloads are excluded. TypeSafe states it does not train on customer inputs, but its privacy terms allow retention as needed for service and legal purposes. Zero-data retention is an enterprise offering and is not included unless separately contracted.</p>
        </div>
        <form onSubmit={(event) => void saveExternalSetting(event)} className="mt-4 space-y-4">
          <label htmlFor="jev-processing-enabled" className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
            <input id="jev-processing-enabled" type="checkbox" checked={enabledDraft} onChange={(event) => { setEnabledDraft(event.target.checked); setSavedMessage(null); setError(null) }} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span>
              <span className="block text-sm font-medium text-gray-900">Allow minimized transaction context to be processed by TypeSafe for Jev suggestions</span>
              <span className="mt-1 block text-sm text-gray-600">Turning this off stops future external classification requests. Existing suggestions and classifications remain available.</span>
            </span>
          </label>
          <button type="submit" disabled={saving || enabledDraft === enabled} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save external-processing choice"}</button>
        </form>
      </section>

      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {savedMessage ? <p role="status" aria-live="polite" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{savedMessage}</p> : null}
    </div>
  )
}

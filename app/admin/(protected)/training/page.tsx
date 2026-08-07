import Link from "next/link"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation } from "@/lib/admin/guard"
import { TrainingStateBadge } from "@/components/admin/training/TrainingStateBadge"
import type { Prisma } from "@/lib/generated/prisma/client"

export default async function AdminTrainingLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; audience?: string; q?: string }>
}) {
  await requireAdminElevation({ minRole: "platform_admin" })
  const filters = await searchParams

  const lifecycleState =
    filters.state === "draft" || filters.state === "review" || filters.state === "published"
      ? filters.state
      : undefined
  const audience = filters.audience === "public" || filters.audience === "signed_in" ? filters.audience : undefined
  const query = filters.q?.trim() ? filters.q.trim() : undefined

  const where: Prisma.TrainingContentWhereInput = {}
  if (lifecycleState) where.lifecycleState = lifecycleState
  if (audience) where.audience = audience
  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { summary: { contains: query, mode: "insensitive" } },
    ]
  }

  const items = await prismaAdmin.trainingContent.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 120,
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      lifecycleState: true,
      audience: true,
      updatedAt: true,
      publishedAt: true,
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Training Studio</h1>
          <p className="mt-1 text-sm text-gray-400">Create, review, publish, and restore help/training guides.</p>
        </div>
        <Link
          href="/admin/training/new"
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-900"
        >
          New Guide
        </Link>
      </div>

      <form method="GET" className="grid gap-3 rounded-xl border border-gray-800 bg-gray-900/60 p-4 md:grid-cols-4">
        <label className="block text-xs text-gray-400">
          Search
          <input
            name="q"
            defaultValue={query}
            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          />
        </label>

        <label className="block text-xs text-gray-400">
          State
          <select
            name="state"
            defaultValue={lifecycleState ?? ""}
            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">All</option>
            <option value="draft">draft</option>
            <option value="review">review</option>
            <option value="published">published</option>
          </select>
        </label>

        <label className="block text-xs text-gray-400">
          Audience
          <select
            name="audience"
            defaultValue={audience ?? ""}
            className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">All</option>
            <option value="signed_in">signed_in</option>
            <option value="public">public</option>
          </select>
        </label>

        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-md border border-gray-700 px-4 py-2 text-sm text-gray-100">
            Apply Filters
          </button>
          <Link href="/admin/training" className="rounded-md border border-gray-800 px-4 py-2 text-sm text-gray-400">
            Reset
          </Link>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/60">
        {items.length === 0 ? (
          <p className="p-5 text-sm text-gray-400">No guides found for the current filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">Guide</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Audience</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-800 last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-100">{item.title}</p>
                    <p className="text-xs text-gray-400">/{item.slug}</p>
                    {item.summary ? <p className="mt-1 text-xs text-gray-500">{item.summary}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <TrainingStateBadge state={item.lifecycleState} />
                  </td>
                  <td className="px-4 py-3 text-gray-300">{item.audience}</td>
                  <td className="px-4 py-3 text-gray-400">{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "-"}</td>
                  <td className="px-4 py-3 text-gray-400">{new Date(item.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/training/${item.id}`} className="text-xs text-blue-300 hover:text-blue-200">
                        Edit
                      </Link>
                      <a href={`/help/${item.slug}`} target="_blank" rel="noreferrer" className="text-xs text-gray-300 hover:text-gray-100">
                        Preview URL
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

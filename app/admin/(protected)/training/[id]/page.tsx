import Link from "next/link"
import { notFound } from "next/navigation"
import { prismaAdmin } from "@/lib/db/admin"
import { requireAdminElevation } from "@/lib/admin/guard"
import { TrainingEditorPanel } from "@/components/admin/training/TrainingEditorPanel"
import type { TrainingLifecycleState } from "@/lib/help/trainingWorkflow"

export default async function AdminTrainingGuidePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminElevation({ minRole: "platform_admin" })
  const { id } = await params

  const item = await prismaAdmin.trainingContent.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      audience: true,
      lifecycleState: true,
      content: true,
      updatedAt: true,
      revisions: {
        orderBy: [{ revisionNumber: "desc" }],
        select: {
          id: true,
          revisionNumber: true,
          snapshotState: true,
          changeNote: true,
          actorUserId: true,
          restoredFromRevisionId: true,
          createdAt: true,
        },
      },
    },
  })

  if (!item) {
    notFound()
  }

  const editorItem = {
    id: item.id,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    audience: item.audience,
    lifecycleState: item.lifecycleState as TrainingLifecycleState,
    content: (item.content ?? {}) as Record<string, unknown>,
    updatedAt: item.updatedAt.toISOString(),
  }

  const revisions = item.revisions.map((revision) => ({
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    snapshotState: revision.snapshotState as TrainingLifecycleState,
    changeNote: revision.changeNote,
    actorUserId: revision.actorUserId,
    restoredFromRevisionId: revision.restoredFromRevisionId,
    createdAt: revision.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-gray-400">
          <Link href="/admin/training" className="hover:text-white">
            ← Training Studio
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white">{item.title}</h1>
        <p className="mt-1 text-sm text-gray-400">Guide ID: {item.id}</p>
      </div>

      <TrainingEditorPanel item={editorItem} revisions={revisions} />
    </div>
  )
}

import { NextRequest, NextResponse } from "next/server"
import { prismaAdmin } from "@/lib/db/admin"
import { createClient } from "@/lib/supabase/server"
import { isGuideVisibleToViewer, helpHrefFromSlug } from "@/lib/help/trainingContent"

/**
 * DB-backed published guide read endpoint.
 * Uses prismaAdmin intentionally because training tables are admin-authored platform tables
 * with deny-all RLS for anon/authenticated tenant roles.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const item = await prismaAdmin.trainingContent.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      content: true,
      lifecycleState: true,
      audience: true,
      publishedAt: true,
      updatedAt: true,
    },
  })

  if (!item || item.lifecycleState !== "published") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (!isGuideVisibleToViewer(item.audience, { isAuthenticated: !!user })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    item: {
      id: item.id,
      slug: item.slug,
      href: helpHrefFromSlug(item.slug),
      title: item.title,
      summary: item.summary,
      content: item.content,
      audience: item.audience,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
    },
  })
}

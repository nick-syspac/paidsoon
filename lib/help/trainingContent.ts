export type TrainingAudience = "public" | "signed_in"

export interface TrainingContentSearchCandidate {
  id: string
  slug: string
  title: string
  summary: string | null
  content: unknown
  audience: TrainingAudience
}

export interface ViewerContext {
  isAuthenticated: boolean
}

export interface RankedTrainingSearchResult {
  id: string
  slug: string
  title: string
  summary: string | null
  audience: TrainingAudience
  href: string
  score: number
}

export function isGuideVisibleToViewer(audience: TrainingAudience, viewer: ViewerContext): boolean {
  if (audience === "public") return true
  return viewer.isAuthenticated
}

export function helpHrefFromSlug(slug: string): string {
  return slug === "index" ? "/help" : `/help/${slug}`
}

export function extractSearchTextFromStructuredContent(value: unknown): string {
  if (value == null) return ""

  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => extractSearchTextFromStructuredContent(entry)).filter(Boolean).join(" ")
  }

  if (typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>)
    return entries
      .map((entry) => extractSearchTextFromStructuredContent(entry))
      .filter(Boolean)
      .join(" ")
  }

  return ""
}

function normalize(value: string): string {
  return value.toLowerCase().trim()
}

function scoreCandidate(candidate: TrainingContentSearchCandidate, query: string): number {
  const q = normalize(query)
  if (!q) return 0

  const title = normalize(candidate.title)
  const summary = normalize(candidate.summary ?? "")
  const body = normalize(extractSearchTextFromStructuredContent(candidate.content))

  let score = 0

  if (title === q) score += 100
  if (title.startsWith(q)) score += 75
  if (title.includes(q)) score += 50
  if (summary.includes(q)) score += 25
  if (body.includes(q)) score += 10

  return score
}

export function filterAndRankTrainingSearch(
  candidates: TrainingContentSearchCandidate[],
  query: string,
  viewer: ViewerContext,
  limit: number
): RankedTrainingSearchResult[] {
  const ranked = candidates
    .filter((candidate) => isGuideVisibleToViewer(candidate.audience, viewer))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(candidate, query),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.candidate.title.localeCompare(b.candidate.title)
    })
    .slice(0, limit)

  return ranked.map((entry) => ({
    id: entry.candidate.id,
    slug: entry.candidate.slug,
    title: entry.candidate.title,
    summary: entry.candidate.summary,
    audience: entry.candidate.audience,
    href: helpHrefFromSlug(entry.candidate.slug),
    score: entry.score,
  }))
}

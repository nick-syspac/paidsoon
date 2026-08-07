import test from "node:test"
import assert from "node:assert/strict"
import {
  extractSearchTextFromStructuredContent,
  filterAndRankTrainingSearch,
  helpHrefFromSlug,
  isGuideVisibleToViewer,
  type TrainingContentSearchCandidate,
} from "@/lib/help/trainingContent"

test("isGuideVisibleToViewer enforces public vs signed_in visibility", () => {
  assert.equal(isGuideVisibleToViewer("public", { isAuthenticated: false }), true)
  assert.equal(isGuideVisibleToViewer("signed_in", { isAuthenticated: false }), false)
  assert.equal(isGuideVisibleToViewer("signed_in", { isAuthenticated: true }), true)
})

test("helpHrefFromSlug preserves /help structure", () => {
  assert.equal(helpHrefFromSlug("index"), "/help")
  assert.equal(helpHrefFromSlug("connect-xero"), "/help/connect-xero")
})

test("extractSearchTextFromStructuredContent traverses nested structures", () => {
  const content = {
    type: "doc",
    content: [
      { type: "heading", text: "How to chase invoices" },
      {
        type: "paragraph",
        children: [{ text: "Pause reminders when needed" }, { text: "Resume later" }],
      },
    ],
  }

  const text = extractSearchTextFromStructuredContent(content)
  assert.equal(text.includes("How to chase invoices"), true)
  assert.equal(text.includes("Pause reminders when needed"), true)
})

test("filterAndRankTrainingSearch filters by audience and ranks by relevance", () => {
  const candidates: TrainingContentSearchCandidate[] = [
    {
      id: "1",
      slug: "connect-xero",
      title: "Connect Xero",
      summary: "Authorize Xero for invoice sync",
      content: { text: "Set up Xero integration for overdue invoices" },
      audience: "public",
    },
    {
      id: "2",
      slug: "internal-playbook",
      title: "Internal reminders playbook",
      summary: "Support-only process",
      content: { text: "How staff should handle disputes" },
      audience: "signed_in",
    },
  ]

  const publicResults = filterAndRankTrainingSearch(candidates, "xero", { isAuthenticated: false }, 10)
  assert.equal(publicResults.length, 1)
  assert.equal(publicResults[0].slug, "connect-xero")

  const authResults = filterAndRankTrainingSearch(candidates, "playbook", { isAuthenticated: true }, 10)
  assert.equal(authResults.length, 1)
  assert.equal(authResults[0].slug, "internal-playbook")
})

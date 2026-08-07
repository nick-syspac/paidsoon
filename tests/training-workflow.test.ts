import test from "node:test"
import assert from "node:assert/strict"
import {
  canEditTrainingDraft,
  canPublishTraining,
  canRoleEditTraining,
  canSubmitTrainingForReview,
  canTransitionTrainingLifecycle,
} from "@/lib/help/trainingWorkflow"

test("role boundaries allow admin and owner, but block support", () => {
  assert.equal(canRoleEditTraining("platform_support"), false)
  assert.equal(canRoleEditTraining("platform_admin"), true)
  assert.equal(canRoleEditTraining("platform_owner"), true)
})

test("lifecycle transitions only allow draft->review and review->published", () => {
  assert.equal(canTransitionTrainingLifecycle("draft", "review"), true)
  assert.equal(canTransitionTrainingLifecycle("review", "published"), true)

  assert.equal(canTransitionTrainingLifecycle("draft", "published"), false)
  assert.equal(canTransitionTrainingLifecycle("review", "draft"), false)
  assert.equal(canTransitionTrainingLifecycle("published", "review"), false)
})

test("draft edit and state-specific transition helpers are strict", () => {
  assert.equal(canEditTrainingDraft("draft"), true)
  assert.equal(canEditTrainingDraft("review"), false)

  assert.equal(canSubmitTrainingForReview("draft"), true)
  assert.equal(canSubmitTrainingForReview("review"), false)

  assert.equal(canPublishTraining("review"), true)
  assert.equal(canPublishTraining("draft"), false)
})

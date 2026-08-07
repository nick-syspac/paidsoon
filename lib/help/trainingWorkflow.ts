import type { PlatformRoleType } from "@/lib/generated/prisma/enums"

export type TrainingLifecycleState = "draft" | "review" | "published"

const EDITOR_ROLES: PlatformRoleType[] = ["platform_admin", "platform_owner"]

export function canRoleEditTraining(role: PlatformRoleType): boolean {
  return EDITOR_ROLES.includes(role)
}

export function canTransitionTrainingLifecycle(
  from: TrainingLifecycleState,
  to: TrainingLifecycleState
): boolean {
  if (from === "draft" && to === "review") return true
  if (from === "review" && to === "published") return true
  return false
}

export function canEditTrainingDraft(state: TrainingLifecycleState): boolean {
  return state === "draft"
}

export function canSubmitTrainingForReview(state: TrainingLifecycleState): boolean {
  return canTransitionTrainingLifecycle(state, "review")
}

export function canPublishTraining(state: TrainingLifecycleState): boolean {
  return canTransitionTrainingLifecycle(state, "published")
}

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMarginClassificationAuditEvent,
  normalizeMarginCostClass,
  resolveMarginClassification,
  shouldApplyMarginRule,
  type MarginClassificationRuleSnapshot,
} from "@/lib/marginguard/classification"

const rules: MarginClassificationRuleSnapshot[] = [
  {
    id: "rule-1",
    userId: "user-1",
    ruleType: "supplier",
    classification: "VARIABLE_COST",
    priority: 20,
    enabled: true,
    matchConfig: { supplierId: "aws" },
  },
  {
    id: "rule-2",
    userId: "user-1",
    ruleType: "category",
    classification: "DIRECT_COST",
    priority: 10,
    enabled: true,
    matchConfig: { categoryKey: "materials" },
  },
  {
    id: "rule-3",
    userId: "user-1",
    ruleType: "text_match",
    classification: "OVERHEAD",
    priority: 5,
    enabled: true,
    matchConfig: { includesText: "office" },
  },
]

test("normalization keeps known classes and falls back to UNCLASSIFIED", () => {
  assert.equal(normalizeMarginCostClass("direct_cost"), "DIRECT_COST")
  assert.equal(normalizeMarginCostClass("overhead"), "OVERHEAD")
  assert.equal(normalizeMarginCostClass("unknown"), "UNCLASSIFIED")
})

test("rule matching supports supplier and category predicates", () => {
  assert.equal(
    shouldApplyMarginRule(rules[0], { supplierId: "AWS" }),
    true,
  )
  assert.equal(
    shouldApplyMarginRule(rules[1], { categoryKey: "materials" }),
    true,
  )
  assert.equal(
    shouldApplyMarginRule(rules[1], { categoryKey: "marketing" }),
    false,
  )
})

test("manual classification overrides automatic rule outcomes", () => {
  const resolved = resolveMarginClassification(rules, { supplierId: "aws" }, "EXCLUDED")
  assert.equal(resolved.classification, "EXCLUDED")
  assert.equal(resolved.origin, "manual")
  assert.equal(resolved.ruleId, null)
})

test("most specific applicable rule wins before priority", () => {
  const resolved = resolveMarginClassification(
    [
      {
        id: "rule-a",
        userId: "user-1",
        ruleType: "text_match",
        classification: "OVERHEAD",
        priority: 1,
        enabled: true,
        matchConfig: { includesText: "aws" },
      },
      {
        id: "rule-b",
        userId: "user-1",
        ruleType: "supplier",
        classification: "VARIABLE_COST",
        priority: 50,
        enabled: true,
        matchConfig: { supplierId: "aws" },
      },
    ],
    { supplierId: "aws", description: "AWS monthly bill" },
  )

  assert.equal(resolved.classification, "VARIABLE_COST")
  assert.equal(resolved.origin, "rule")
  assert.equal(resolved.ruleId, "rule-b")
})

test("classification falls back to default UNCLASSIFIED when no rule matches", () => {
  const resolved = resolveMarginClassification(rules, { supplierId: "other" })
  assert.equal(resolved.classification, "UNCLASSIFIED")
  assert.equal(resolved.origin, "default")
})

test("audit event payload includes actor, status transition, and rule lineage", () => {
  const event = buildMarginClassificationAuditEvent({
    userId: "user-1",
    actorId: "actor-1",
    oldClassification: "UNCLASSIFIED",
    newClassification: "DIRECT_COST",
    oldRuleId: null,
    newRuleId: "rule-2",
    sourceType: "imported_bill",
    sourceRecordId: "bill-123",
  })

  assert.equal(event.userId, "user-1")
  assert.equal(event.eventType, "MARGIN_CLASSIFICATION_UPDATED")
  assert.equal(event.oldStatus, "UNCLASSIFIED")
  assert.equal(event.newStatus, "DIRECT_COST")
  assert.deepEqual(event.metadata, {
    sourceType: "imported_bill",
    sourceRecordId: "bill-123",
    oldRuleId: null,
    newRuleId: "rule-2",
  })
})

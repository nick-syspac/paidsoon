import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { formatIntegrationNameList, getIntegrationsByStatus } from "@/lib/integrationsCatalog"

export type MarketingModuleId = "paidsoon" | "spendleak" | "costguard" | "cashplan"

export interface MarketingModuleDefinition {
  id: MarketingModuleId
  name: string
  question: string
  tagline: string
  summary: string
  problem: string
  capabilities: string[]
  workflow: string[]
  outcomes: string[]
  faq: Array<{ q: string; a: string }>
  disclaimer?: string
  accentClass: string
}

export const PLATFORM_TAGLINE =
  "Your accounting software tells you what happened. PaidSoon helps you control what happens next."

export const PLATFORM_CYCLE = [
  "Get paid",
  "Stop waste",
  "Control costs",
  "Plan ahead",
]

export const MODULES: MarketingModuleDefinition[] = [
  {
    id: "paidsoon",
    name: "PaidSoon",
    question: "When will customers pay us?",
    tagline: "Stop chasing invoices. Start managing when you get paid.",
    summary:
      "Automate invoice follow-up so overdue accounts are handled consistently without awkward manual chasing.",
    problem:
      "Manual follow-up is inconsistent. Busy weeks delay reminders, debtors drift, and cash receipts become unpredictable.",
    capabilities: [
      "Automated polite-to-firm reminder sequence",
      "Promise-to-pay tracking with pause/resume controls",
      "Dispute pause to avoid sending during active issues",
      "Debtor dashboard showing what needs attention now",
    ],
    workflow: [
      "Import invoices from Stripe, Xero, MYOB, or CSV",
      "Set reminder cadence and sender details",
      "PaidSoon sends reminders and records outcomes",
      "Your team reviews exceptions, promises, and disputes",
    ],
    outcomes: [
      "Less time spent chasing debtors",
      "More consistent follow-up behaviour",
      "Improved likelihood of faster payment",
    ],
    faq: [
      {
        q: "Does PaidSoon guarantee payment?",
        a: "No. It improves consistency and visibility so you can intervene earlier, but it does not guarantee customer payment.",
      },
      {
        q: "Does it replace accounting software?",
        a: "No. It complements your existing accounting system by turning invoice data into follow-up action.",
      },
    ],
    accentClass: "border-sky-200 bg-sky-50 text-sky-900",
  },
  {
    id: "spendleak",
    name: "SpendLeak",
    question: "Where are we wasting money?",
    tagline: "Small expenses become expensive when nobody is watching.",
    summary:
      "Identify recurring spend patterns that deserve review before they quietly drain cash.",
    problem:
      "Subscription renewals, duplicated tools, and creeping charges are easy to miss when nobody owns regular spend review.",
    capabilities: [
      "Recurring expense visibility",
      "Potential duplicate/overlap detection",
      "Price-rise and stale-spend flags",
      "Review-ready list for practical action",
    ],
    workflow: [
      "Import spend data",
      "SpendLeak groups recurring charges",
      "Potential leaks are surfaced for review",
      "You confirm, keep, renegotiate, or cancel where appropriate",
    ],
    outcomes: [
      "Fewer forgotten recurring costs",
      "Sharper spend conversations",
      "Improved cash retention over time",
    ],
    faq: [
      {
        q: "Should every flagged item be cancelled?",
        a: "No. SpendLeak highlights items that need review, not automatic cancellation decisions.",
      },
      {
        q: "What types of businesses is it for?",
        a: "Any small business with recurring software, contractor, or service spend can benefit from regular review.",
      },
    ],
    accentClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  {
    id: "costguard",
    name: "CostGuard",
    question: "Are our costs getting out of control?",
    tagline: "Know when costs are drifting before they damage your margin.",
    summary:
      "Monitor cost categories and exception trends so margin pressure is visible before it becomes a crisis.",
    problem:
      "Waste review alone is not enough. Category-level cost drift can quietly compress margin if it is not monitored against targets.",
    capabilities: [
      "Category-level cost monitoring",
      "Threshold and variance alerting",
      "Budget/period comparisons",
      "Exception-focused action cues",
    ],
    workflow: [
      "Set categories and guardrails",
      "CostGuard monitors trend and variance movement",
      "Alerts surface unusual movement",
      "You investigate and act before drift hardens",
    ],
    outcomes: [
      "Earlier detection of margin pressure",
      "Better budget discipline",
      "More confident operating decisions",
    ],
    faq: [
      {
        q: "How is CostGuard different from SpendLeak?",
        a: "SpendLeak focuses on individual recurring expenses and possible waste. CostGuard monitors broader category movement, trends, and exceptions.",
      },
      {
        q: "Does it set my budgets automatically?",
        a: "No. You set targets and thresholds; CostGuard helps you monitor and respond.",
      },
    ],
    accentClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    id: "cashplan",
    name: "CashPlan",
    question: "Will we have enough cash for what comes next?",
    tagline: "See the cash squeeze before you feel it.",
    summary:
      "Forecast cash position using expected inflows and outflows so decisions can be made earlier.",
    problem:
      "Many businesses only discover a cash shortfall when it is already urgent. Planning windows are too short when payment timing is uncertain.",
    capabilities: [
      "Forward cash position forecasting",
      "Scenario testing for timing and spend decisions",
      "Shortfall early-warning visibility",
      "Late-payment impact modelling",
    ],
    workflow: [
      "Combine expected money-in and money-out",
      "Model likely and conservative scenarios",
      "Identify shortfall windows",
      "Decide actions earlier with clearer trade-offs",
    ],
    outcomes: [
      "Earlier cash decisions",
      "Reduced financial firefighting",
      "Greater confidence around tax, payroll, and commitments",
    ],
    faq: [
      {
        q: "Is CashPlan financial advice?",
        a: "No. CashPlan is a decision-support and forecasting tool, not financial advice.",
      },
      {
        q: "Can it predict cash perfectly?",
        a: "No forecast is perfect. CashPlan helps you see likely outcomes earlier and stress-test assumptions.",
      },
    ],
    disclaimer: "CashPlan provides planning support only and does not guarantee future cash outcomes.",
    accentClass: "border-violet-200 bg-violet-50 text-violet-900",
  },
]

export const MODULE_HREF: Record<MarketingModuleId, string> = {
  paidsoon: "/paidsoon",
  spendleak: "/spendleak",
  costguard: "/costguard",
  cashplan: "/cashplan",
}

export function getModuleById(id: MarketingModuleId): MarketingModuleDefinition {
  const moduleDef = MODULES.find((item) => item.id === id)
  if (!moduleDef) {
    throw new Error(`Unknown marketing module: ${id}`)
  }
  return moduleDef
}

export function getCtaForLiveMode(liveMode: boolean): { label: string; href: string; helper: string } {
  if (liveMode) {
    return {
      label: "Start free trial",
      href: "/sign-up",
      helper: "14-day trial. No credit card required.",
    }
  }

  return {
    label: "Request early access",
    href: "/contact",
    helper: "Join the waitlist and we will help you get set up.",
  }
}

export function getIntegrationSupportCopy(): string {
  const available = getIntegrationsByStatus("available").map((item) => item.name)
  const planned = getIntegrationsByStatus("planned").map((item) => item.name)

  const live = formatIntegrationNameList(available)
  const upcoming = planned.length > 0 ? `${formatIntegrationNameList(planned)} planned.` : ""

  return `${live} available today. ${upcoming}`.trim()
}

export function getPublicPlanSummary(): string[] {
  return Object.values(PLAN_CATALOG)
    .filter((plan) => plan.visibility === "public")
    .map((plan) => `${plan.name}: A$${plan.monthlyPriceAud}/month`)
}

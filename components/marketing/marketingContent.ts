import { PLAN_CATALOG } from "@/lib/subscriptionPlans"
import { formatIntegrationNameList, getIntegrationsByStatus } from "@/lib/integrationsCatalog"

export type MarketingModuleId =
  | "paidsoon"
  | "spendleak"
  | "costguard"
  | "cashplan"
  | "commitguard"
  | "owners-digest"
  | "tax-buffer"
  | "margin-guard"
  | "runway-guard"

export type MarketingPlatformAreaId = "get-paid" | "stop-waste" | "control-costs" | "plan-ahead"

export interface MarketingModuleDefinition {
  id: MarketingModuleId
  href: string
  name: string
  statusLabel: string
  platformArea: MarketingPlatformAreaId
  question: string
  tagline: string
  summary: string
  problem: string
  capabilities: string[]
  workflow: string[]
  outcomes: string[]
  faq: Array<{ q: string; a: string }>
  relatedModules: MarketingModuleId[]
  disclaimer?: string
  accentClass: string
}

export interface MarketingPlatformArea {
  id: MarketingPlatformAreaId
  name: string
  summary: string
  moduleIds: MarketingModuleId[]
}

export const PLATFORM_TAGLINE =
  "Your accounting software tells you what happened. PaidSoon helps you control what happens next."

export const PLATFORM_CYCLE = [
  "Get paid",
  "Stop waste",
  "Control costs",
  "Plan ahead",
]

export const PLATFORM_AREAS: MarketingPlatformArea[] = [
  {
    id: "get-paid",
    name: "Get paid",
    summary: "Keep receivables moving and debtor promises visible before cash slips further out.",
    moduleIds: ["paidsoon"],
  },
  {
    id: "stop-waste",
    name: "Stop waste",
    summary: "Find recurring spend worth reviewing before leakage becomes normal operating cost.",
    moduleIds: ["spendleak", "owners-digest"],
  },
  {
    id: "control-costs",
    name: "Control costs",
    summary: "Monitor commitments, category drift, and margin pressure while there is still room to act.",
    moduleIds: ["costguard", "commitguard", "margin-guard"],
  },
  {
    id: "plan-ahead",
    name: "Plan ahead",
    summary: "Protect tax cash, model shortfalls, and make funding decisions earlier.",
    moduleIds: ["cashplan", "tax-buffer", "runway-guard"],
  },
]

export const MODULES: MarketingModuleDefinition[] = [
  {
    id: "paidsoon",
    href: "/paidsoon",
    name: "InvoiceGuard",
    statusLabel: "Available now",
    platformArea: "get-paid",
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
      "InvoiceGuard sends reminders and records outcomes",
      "Your team reviews exceptions, promises, and disputes",
    ],
    outcomes: [
      "Less time spent chasing debtors",
      "More consistent follow-up behaviour",
      "Improved likelihood of faster payment",
    ],
    faq: [
      {
        q: "Does InvoiceGuard guarantee payment?",
        a: "No. InvoiceGuard improves consistency and visibility so you can intervene earlier, but it does not guarantee customer payment.",
      },
      {
        q: "Does it replace accounting software?",
        a: "No. It complements your existing accounting system by turning invoice data into follow-up action.",
      },
    ],
    relatedModules: ["cashplan", "commitguard", "owners-digest"],
    accentClass: "border-sky-200 bg-sky-50 text-sky-900",
  },
  {
    id: "spendleak",
    href: "/spendleak",
    name: "SpendLeak",
    statusLabel: "Available now",
    platformArea: "stop-waste",
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
    relatedModules: ["costguard", "commitguard", "owners-digest"],
    accentClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  {
    id: "costguard",
    href: "/costguard",
    name: "CostGuard",
    statusLabel: "Available now",
    platformArea: "control-costs",
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
    relatedModules: ["spendleak", "margin-guard", "owners-digest"],
    accentClass: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    id: "cashplan",
    href: "/cashplan",
    name: "CashPlan",
    statusLabel: "Available now",
    platformArea: "plan-ahead",
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
    relatedModules: ["tax-buffer", "runway-guard", "commitguard"],
    disclaimer: "CashPlan provides planning support only and does not guarantee future cash outcomes.",
    accentClass: "border-violet-200 bg-violet-50 text-violet-900",
  },
  {
    id: "commitguard",
    href: "/commitguard",
    name: "CommitGuard",
    statusLabel: "Available now",
    platformArea: "control-costs",
    question: "How much cash is already committed?",
    tagline: "See your committed cash before a renewal, contract, or reserve catches you late.",
    summary:
      "Track known commitments, renewal windows, and protected cash so free cash decisions are made with fewer surprises.",
    problem:
      "Known obligations are often scattered across contracts, renewals, and mental notes. That leaves teams making spend decisions without a reliable view of what cash is already spoken for.",
    capabilities: [
      "Committed cash totals across upcoming time horizons",
      "Renewal and notice-period visibility for recurring obligations",
      "Free-cash view that accounts for protected cash and safety buffers",
      "Detections and review queue for recurring commitment candidates",
    ],
    workflow: [
      "Capture or confirm commitments and renewal terms",
      "CommitGuard projects those obligations across upcoming horizons",
      "The module highlights renewals, committed cash, and free-cash pressure",
      "Your team acts earlier on renewals, spend decisions, or reprioritisation",
    ],
    outcomes: [
      "Fewer commitment surprises",
      "More reliable free-cash decisions",
      "Earlier renewal and notice-period action",
    ],
    faq: [
      {
        q: "Is CommitGuard the same as CashPlan?",
        a: "No. CommitGuard focuses on obligations you already know about, while CashPlan models broader expected inflows and outflows.",
      },
      {
        q: "Does it replace contract management?",
        a: "No. It gives finance and operators a clearer cash-control view of commitments rather than replacing a legal or procurement system.",
      },
    ],
    relatedModules: ["cashplan", "tax-buffer", "runway-guard"],
    accentClass: "border-cyan-200 bg-cyan-50 text-cyan-950",
  },
  {
    id: "owners-digest",
    href: "/owners-digest",
    name: "Owner's Digest",
    statusLabel: "Available now",
    platformArea: "stop-waste",
    question: "What matters most this week?",
    tagline: "One owner-level briefing across receivables, spend, margin, runway, and risk.",
    summary:
      "Pull the most material financial signals into a single deterministic summary so operators can focus on the few things that deserve attention now.",
    problem:
      "When signals are spread across multiple modules, owners either miss important changes or spend too much time piecing together the full picture themselves.",
    capabilities: [
      "Ranked weekly summary of important signals across modules",
      "History view for tracking shifts over time",
      "Entitlement-aware coverage that omits unavailable modules cleanly",
      "Clear drill-down links back to the source module behind each alert or opportunity",
    ],
    workflow: [
      "PaidSoon collects signals from receivables, spend, commitments, margin, tax, and runway modules",
      "Owner's Digest filters and ranks the most material items",
      "You review one summary instead of opening every module first",
      "Then you drill into the specific module that needs action",
    ],
    outcomes: [
      "Faster weekly financial reviews",
      "Less signal overload across modules",
      "Clearer prioritisation for owners and operators",
    ],
    faq: [
      {
        q: "Is the digest only an email?",
        a: "No. It has an in-app dashboard and history view, with email delivery on entitled plans where that delivery path is enabled.",
      },
      {
        q: "Does it use every module automatically?",
        a: "It only includes modules your plan can access and that are operational for your account.",
      },
    ],
    relatedModules: ["paidsoon", "spendleak", "margin-guard"],
    accentClass: "border-rose-200 bg-rose-50 text-rose-950",
  },
  {
    id: "tax-buffer",
    href: "/tax-buffer",
    name: "Tax Buffer",
    statusLabel: "Available now",
    platformArea: "plan-ahead",
    question: "How much cash should stay reserved for tax?",
    tagline: "Protect the tax cash before it is accidentally spent somewhere else.",
    summary:
      "Set and monitor tax reserve targets so BAS, GST, PAYG, and other obligations are visible as protected cash, not wishful leftovers.",
    problem:
      "Many businesses treat tax cash as available until the due date gets close. By then, the money is often already committed somewhere else.",
    capabilities: [
      "Reserve targets across GST, PAYG, income tax, and custom categories",
      "Upcoming obligation view with covered versus shortfall status",
      "Recommended reserve actions with explainability",
      "Overrides and settings for how the reserve should be managed",
    ],
    workflow: [
      "Configure the tax categories and reserve rules that matter to your business",
      "Tax Buffer estimates reserve requirements and upcoming obligations",
      "The module compares protected cash against target reserve needs",
      "You transfer or protect cash earlier when a gap appears",
    ],
    outcomes: [
      "Fewer tax-time cash shocks",
      "Stronger discipline around protected cash",
      "Earlier visibility of reserve gaps",
    ],
    faq: [
      {
        q: "Is Tax Buffer tax advice?",
        a: "No. It is a cash-planning and reserve-support tool, not tax advice or lodgement software.",
      },
      {
        q: "Can I customise reserve categories?",
        a: "Yes. The module supports custom reserve categories alongside the core tax reserve categories.",
      },
    ],
    relatedModules: ["cashplan", "commitguard", "runway-guard"],
    disclaimer: "Tax Buffer supports planning and reserve discipline only. It does not provide tax advice or prepare tax filings.",
    accentClass: "border-orange-200 bg-orange-50 text-orange-950",
  },
  {
    id: "margin-guard",
    href: "/margin-guard",
    name: "MarginGuard",
    statusLabel: "Available now",
    platformArea: "control-costs",
    question: "Are we still making enough on the work we win?",
    tagline: "Spot margin erosion before it turns into a cash-flow problem.",
    summary:
      "Track profitability, deterioration, and threshold alerts so weak margins are visible before they become an operating surprise.",
    problem:
      "Revenue growth can hide profit erosion for too long. Teams often feel the cash pressure before they can clearly see where margin has slipped.",
    capabilities: [
      "Gross-margin and profitability summaries with confidence indicators",
      "Threshold-based alerts for deterioration and margin-at-risk",
      "Breakdowns by category and customer where the data supports it",
      "Trend visibility so operators can see whether margins are recovering or worsening",
    ],
    workflow: [
      "Set margin targets and thresholds",
      "MarginGuard evaluates recent performance and underlying cost movement",
      "Alerts and trends show where profitability is deteriorating",
      "You investigate the drivers and adjust pricing, mix, or cost controls sooner",
    ],
    outcomes: [
      "Earlier margin-pressure detection",
      "Better pricing and cost conversations",
      "Stronger operating discipline before profits erode further",
    ],
    faq: [
      {
        q: "Does MarginGuard replace management reporting?",
        a: "No. It complements management reporting with earlier warnings and action-oriented margin signals.",
      },
      {
        q: "Can it explain data quality gaps?",
        a: "Yes. MarginGuard surfaces confidence and completeness signals so you can judge how much weight to put on each view.",
      },
    ],
    relatedModules: ["costguard", "runway-guard", "owners-digest"],
    accentClass: "border-lime-200 bg-lime-50 text-lime-950",
  },
  {
    id: "runway-guard",
    href: "/runway-guard",
    name: "RunwayGuard",
    statusLabel: "Available now",
    platformArea: "plan-ahead",
    question: "How much runway do we really have?",
    tagline: "Keep your cash runway visible before pressure becomes urgent.",
    summary:
      "Estimate runway using current cash, burn, obligations, and forecast shifts so teams can respond before options narrow.",
    problem:
      "Runway pressure rarely appears all at once. Without a dedicated view, teams often realise how tight things are only after several smaller signals have compounded.",
    capabilities: [
      "Runway snapshots based on current cash position and burn assumptions",
      "Alerting for deteriorating runway and policy breaches",
      "Scenario support on higher plans for testing potential changes",
      "Connections to margin, commitments, and tax reserves for a more realistic picture",
    ],
    workflow: [
      "Set runway policy and key assumptions",
      "RunwayGuard combines cash, burn, and adjustment inputs into a runway view",
      "The module highlights deteriorating runway earlier",
      "Your team can intervene on costs, receivables, or financing before urgency increases",
    ],
    outcomes: [
      "Earlier runway risk visibility",
      "Clearer escalation timing for cost or funding decisions",
      "More realistic planning under changing conditions",
    ],
    faq: [
      {
        q: "Is RunwayGuard only for startups?",
        a: "No. Any business that needs a clearer view of cash duration and timing pressure can use it.",
      },
      {
        q: "Does it work by itself?",
        a: "It is strongest when used alongside CashPlan, CommitGuard, MarginGuard, and Tax Buffer because those modules sharpen the underlying assumptions.",
      },
    ],
    relatedModules: ["cashplan", "commitguard", "tax-buffer"],
    disclaimer: "RunwayGuard is a planning and monitoring tool. It does not guarantee future liquidity outcomes or financing availability.",
    accentClass: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950",
  },
]

export const MODULE_HREF: Record<MarketingModuleId, string> = {
  paidsoon: "/paidsoon",
  spendleak: "/spendleak",
  costguard: "/costguard",
  cashplan: "/cashplan",
  commitguard: "/commitguard",
  "owners-digest": "/owners-digest",
  "tax-buffer": "/tax-buffer",
  "margin-guard": "/margin-guard",
  "runway-guard": "/runway-guard",
}

export const PRODUCT_LINKS = MODULES.map((moduleDef) => ({
  label: moduleDef.name,
  href: moduleDef.href,
})).concat([
  { label: "Platform overview", href: "/platform" },
  { label: "Pricing", href: "/pricing" },
  { label: "Integrations", href: "/integrations" },
])

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

export function getModulesByPlatformArea(areaId: MarketingPlatformAreaId): MarketingModuleDefinition[] {
  const area = PLATFORM_AREAS.find((item) => item.id === areaId)
  if (!area) {
    throw new Error(`Unknown platform area: ${areaId}`)
  }

  return area.moduleIds.map((moduleId) => getModuleById(moduleId))
}

export function getRelatedModules(id: MarketingModuleId): MarketingModuleDefinition[] {
  return getModuleById(id).relatedModules.map((moduleId) => getModuleById(moduleId))
}

export function getPublicPlanSummary(): string[] {
  return Object.values(PLAN_CATALOG)
    .filter((plan) => plan.visibility === "public")
    .map((plan) => `${plan.name}: A$${plan.monthlyPriceAud}/month`)
}

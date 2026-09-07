# PaidSoon 90-Day Website Traffic Plan

**Prepared:** 30 August 2026  
**Primary market:** Australian small businesses  
**Founder time:** About 4 hours per week  
**Recommended test budget:** AUD $0 in month 1, then up to $300–$500 per month once the site converts visitors  
**Working tagline:** **Stop chasing. Start automating.**

---

## 1. The plan in one page

PaidSoon should not try to win by saying only “we send invoice reminders.” Xero and MYOB already provide automated reminders. PaidSoon needs to own the workflow **after an invoice becomes a follow-up problem**:

- See every invoice that needs attention in one place.
- Send consistent, relationship-safe follow-ups.
- Record promises to pay and the dates promised.
- Pause follow-ups when an invoice is disputed.
- Import invoices without forcing a business to change accounting software.
- Give the owner a clear weekly debtor summary.

The first 90 days use five traffic engines, in this order:

1. **Make the site indexable and measurable.**
2. **Make the homepage convert qualified visitors.**
3. **Publish high-intent pages and genuinely useful free resources.**
4. **Distribute each resource through the founder’s network and bookkeeper relationships.**
5. **Test small, exact-match Google Ads only after organic visitors are converting.**

### 90-day planning targets

These are operating targets, not a revenue forecast.

| Metric | End of month 1 | End of month 2 | End of month 3 |
|---|---:|---:|---:|
| Qualified website sessions per month | 100 | 250 | 500 |
| Search impressions per month | 1,000 | 5,000 | 12,000 |
| Signup or demo conversion | Establish baseline | 3%+ | 4%+ |
| New trials/leads per month | 3–5 | 8–15 | 20–30 |
| Activated accounts per month | 2–3 | 5–8 | 10–15 |
| New paying customers per month | 1–2 | 2–4 | 4–8 |

An **activated account** has imported or added at least one real invoice and enabled or completed its first follow-up action. Traffic without activation is not success.

---

## 2. Who PaidSoon should target first

“All small businesses” is too broad for the first campaign. Start with one clear beachhead.

### Primary customer

An Australian owner-managed B2B service business that:

- Has 2–50 staff.
- Sends at least 10 invoices per month.
- Regularly has 5 or more unpaid invoices.
- Uses Xero, MYOB, or spreadsheet exports.
- Has the owner, office manager, or bookkeeper manually checking and chasing overdue invoices.
- Cares about preserving customer relationships and does not want aggressive debt collection.

Good first examples are consultants, agencies, IT service providers, training businesses, commercial trades, maintenance companies, wholesalers, and other recurring B2B service firms.

### Channel partner

Bookkeepers and small accounting practices are the best early partner audience. One bookkeeper may influence 10–50 businesses, already understands the pain, and can identify clients who need more than the reminders inside their accounting package.

### Do not target yet

- Consumers trying to collect money from friends.
- Large enterprise credit-control departments.
- Businesses looking for debt collection or legal recovery.
- Businesses primarily searching for invoice creation software.
- Every industry at once.

---

## 3. Positioning that can compete with Xero and MYOB

Xero and MYOB already offer scheduled reminders, customer-level settings, and overdue visibility. PaidSoon therefore needs to be positioned as the **follow-up control layer**, not as a basic reminder replacement.

### Recommended positioning statement

> PaidSoon helps Australian small businesses stay on top of overdue invoices without awkward manual chasing. It keeps follow-ups moving, records promises to pay, pauses disputed invoices, and gives the owner one clear view of what needs attention—without replacing their accounting software.

### Homepage copy

**H1:** Stop chasing overdue invoices. Start automating.

**Subheading:** PaidSoon keeps polite follow-ups moving, tracks promises to pay, pauses disputed invoices, and gives Australian small businesses one clear debtor view—without replacing their accounting software.

**Primary call to action:** Start your free trial  
Use this only if a working self-service trial exists. Otherwise use **See PaidSoon in action**.

**Secondary call to action:** See how it works

### Three homepage proof points

1. **Know what needs attention** — See overdue invoices and next actions in one place.
2. **Follow up consistently** — Use polite, escalating reminders without spending Friday afternoon chasing.
3. **Stay in control** — Record promises, pause disputes, and see exactly what has happened.

### Feature-truth rule

Before publishing any page or claim, label each feature internally as:

- `LIVE`: usable by a new customer today.
- `BETA`: usable, but clearly labelled beta.
- `PLANNED`: do not advertise as available.

Never say “Works with Xero,” “Works with MYOB,” “automatic,” or “sends SMS” unless a new customer can complete that workflow in production. A waitlist page may say **Xero integration coming soon**, but it must not resemble a live integration page.

### Brand-search issue to address

A current web search surfaces an unrelated Android app also called PaidSoon, as well as similar names such as PaySoon. Use the consistent public descriptor **“PaidSoon Australia — Invoice Follow-Up Automation”** in the title tag, social profiles, directory listings, and launch material. Before significant ad or design expenditure, perform an Australian trade mark and brand-conflict check.

---

## 4. Week 1: make the site findable and measurable

Do not publish ten articles until this section passes.

### Indexing checklist

- [ ] Create and verify a Google Search Console **Domain property** for `paidsoon.com.au`.
- [ ] Check the production response is `200`, not a redirect loop or authentication page.
- [ ] Confirm production pages do not contain `noindex`.
- [ ] Confirm `robots.txt` does not block `/`, `/_next/`, images, CSS, or JavaScript needed to render the page.
- [ ] Generate `https://paidsoon.com.au/sitemap.xml` from the public routes.
- [ ] Add the sitemap URL to `robots.txt`.
- [ ] Submit the sitemap in Search Console.
- [ ] Use URL Inspection on the homepage and request indexing.
- [ ] Confirm every useful public page is reachable through an ordinary HTML link.
- [ ] Use one canonical hostname: either `www` or non-`www`, with a permanent redirect from the other.
- [ ] Add a self-referencing canonical URL to every public page.
- [ ] Make sure the page title, H1, and important product explanation appear in server-rendered HTML.
- [ ] Add an Open Graph image, favicon, and descriptive social metadata.
- [ ] Add `Organization`, `SoftwareApplication`, and appropriate `FAQPage` structured data only where the visible page supports it.
- [ ] Verify the structured data with Google’s Rich Results Test.
- [ ] Add Bing Webmaster Tools and import the Search Console property.

### Minimum metadata

**Homepage title:** `PaidSoon Australia | Automated Invoice Follow-Up`

**Homepage description:** `Stop manually chasing overdue invoices. PaidSoon automates polite follow-ups, tracks promises and disputes, and keeps Australian small-business cash flow moving.`

### Analytics checklist

Use GA4, Plausible, PostHog, or another product analytics tool. One tool used consistently is better than three half-configured tools.

- [ ] Track `page_view`.
- [ ] Track `pricing_view`.
- [ ] Track `primary_cta_click`.
- [ ] Track `signup_started`.
- [ ] Track `signup_completed`.
- [ ] Track `invoice_imported`.
- [ ] Track `first_followup_enabled` or `first_followup_completed`.
- [ ] Track `subscription_started` with plan name.
- [ ] Exclude your own devices and staging/preview traffic.
- [ ] Record a baseline in the scorecard at the end of week 1.

Use this UTM pattern everywhere:

```text
utm_source=linkedin
utm_medium=organic_social
utm_campaign=founder_launch_2026
utm_content=promise_to_pay_post
```

### Week 1 acceptance criteria

- The homepage passes URL Inspection without a crawl or rendering error.
- The sitemap is accepted.
- A test signup can be traced from landing page to activation.
- Internal and preview traffic are excluded.
- Search Console begins reporting impressions, even if the number is zero initially.

---

## 5. Week 2: make the site worth sending traffic to

The homepage must answer these questions in less than 20 seconds:

1. What is PaidSoon?
2. Who is it for?
3. Why is it better than the reminders already in accounting software?
4. What does it cost?
5. What should I do next?

### Homepage sections, in order

1. Clear headline, subheading, and CTA.
2. Real product screenshot showing overdue invoices and next actions.
3. Three-step explanation: import, automate, review.
4. The four differentiators: promises, disputes, consistent follow-up, weekly view.
5. “Fits your workflow” section listing only live import/integration options.
6. A short worked example showing what happens from 1 day before due to 30 days overdue.
7. Pricing in AUD, including GST wording and cancellation terms.
8. A testimonial or beta-user result once genuine evidence exists.
9. Security, privacy, Australian business identity, support contact, terms, and privacy links.
10. FAQ that handles “Why not just use Xero/MYOB reminders?” honestly.
11. Final CTA.

### Recommended FAQ answer

**Why not just use the reminders in Xero or MYOB?**

> Their built-in reminders are a good starting point. PaidSoon is for businesses that also need a repeatable follow-up workflow: visibility across invoices, promises-to-pay, dispute pauses, owner summaries, and a clear record of the next action. Use the simplest tool that solves your problem.

This honest answer creates more trust than pretending the accounting products do nothing.

### Conversion acceptance criteria

- [ ] There is one obvious primary CTA above the fold.
- [ ] The CTA works on mobile and desktop.
- [ ] No public page has placeholder copy or fake testimonials.
- [ ] A visitor can see pricing without contacting sales.
- [ ] At least one real product screenshot appears before the pricing section.
- [ ] The site describes an outcome, not just features.

---

## 6. The content engine

Publish **one strong page per week**. Each page should solve a specific job, include an original PaidSoon workflow or screenshot, and lead naturally to the product. Do not publish generic AI-written finance articles merely to increase page count.

### The first 10 pages to create

| Priority | Page/title | Search intent | Main CTA |
|---:|---|---|---|
| 1 | Overdue Invoice Reminder Email Templates for Australian Small Business | Wants wording now | Copy templates; try PaidSoon |
| 2 | How to Follow Up an Overdue Invoice Without Damaging the Relationship | Wants a process | Use the PaidSoon follow-up workflow |
| 3 | Xero Invoice Reminders vs PaidSoon | Comparing built-in and specialist tools | See whether PaidSoon is needed |
| 4 | MYOB Invoice Reminders vs PaidSoon | Comparing built-in and specialist tools | See whether PaidSoon is needed |
| 5 | Free Aged Receivables and Promise-to-Pay Tracker | Wants a spreadsheet/template | Download; import into PaidSoon |
| 6 | How Often Should You Follow Up an Overdue Invoice? | Wants timing guidance | Use a ready-made sequence |
| 7 | What to Do When a Customer Disputes an Invoice | Wants workflow guidance | Pause and track the dispute |
| 8 | Invoice Follow-Up Software for Australian Small Business | Ready to evaluate software | Start trial/demo |
| 9 | Invoice Follow-Up for Bookkeepers | Partner or multi-client intent | Join beta/referral program |
| 10 | How to Automate Invoice Follow-Up from CSV or XLSX | Has no supported live integration | Download example/import invoices |

Only publish Xero, MYOB, CSV, or XLSX product claims that pass the feature-truth rule.

### Standard article definition of done

- [ ] One primary search question, used naturally in the title and H1.
- [ ] A direct answer in the first 100 words.
- [ ] One original checklist, workflow, template, calculator, or screenshot.
- [ ] Examples written for Australian businesses.
- [ ] A visible “last reviewed” date and named author.
- [ ] Links to two relevant PaidSoon pages.
- [ ] One clear CTA.
- [ ] A useful meta title and description.
- [ ] Article is linked from the Resources index and at least one other public page.
- [ ] Article has been manually reviewed for accuracy and product truth.

### The free resource that should lead the campaign

Create an ungated page called **“7 Polite Overdue Invoice Email Templates for Australian Small Business.”** Give visitors the complete templates on the page. Offer an optional download in exchange for email, but do not hide the core value behind a form.

Include:

- Before-due reminder.
- Due-today reminder.
- 3-day friendly follow-up.
- 7-day direct follow-up.
- Promise-to-pay confirmation.
- Disputed-invoice acknowledgement.
- Final internal escalation notice, with a clear legal-advice disclaimer.

This page can attract search traffic, demonstrate PaidSoon’s relationship-safe tone, and support every LinkedIn or partner conversation.

---

## 7. The 12-week execution backlog

Treat this as the sprint plan. Do not pull work forward until the current week’s acceptance criterion passes.

| Week | Build/publish | Distribution | Acceptance criterion |
|---:|---|---|---|
| 1 | Search Console, sitemap, robots, canonicals, analytics events | None | Indexing and activation tracking work end-to-end |
| 2 | Rewrite homepage and add real screenshots, pricing, FAQ, trust | One founder LinkedIn launch post; send to 5 trusted contacts for feedback | Five people can explain PaidSoon after viewing the homepage |
| 3 | Publish overdue-invoice email template page | Two LinkedIn posts; share individually with 5 relevant owners/bookkeepers | Page indexed; first non-founder visitors recorded |
| 4 | Publish overdue-invoice follow-up process | Ask 5 current contacts for a 15-minute problem interview | Three interviews completed; language added to homepage/content |
| 5 | Publish free promise-to-pay/aged-receivables tracker | Approach 5 bookkeepers through existing relationships or professional networks | Two bookkeeper conversations booked |
| 6 | Publish the live CSV/XLSX workflow page or another live-feature page | Demonstrate it in a 60-second screen recording | At least 25 qualified video/page visits |
| 7 | Publish the honest Xero comparison page | Share with Xero-using contacts; ask what the built-in reminders miss | Five useful responses; comparison updated |
| 8 | Publish MYOB comparison or bookkeeper page | Offer three suitable businesses a structured 30-day beta | One beta begins with real invoices |
| 9 | Publish a case study or beta learning report | Share the measured result with permission | Includes a real before/after measure or verified quote |
| 10 | Improve the two pages with the most impressions but low clicks | Start a 14-day exact-match search-ad test if conversion is at least 3% | Ad and organic traffic use separate UTMs |
| 11 | Publish the page answering the most common sales objection | Ask partners and beta users for a relevant link or introduction | Two credible external mentions or links earned |
| 12 | Review the scorecard; update homepage, CTA, and roadmap | Publish a transparent 90-day founder update | Decide what to continue, change, and stop |

---

## 8. The four-hour weekly operating loop

Put these recurring tasks in your calendar.

### Monday — 25 minutes: inspect

- Search Console: impressions, clicks, queries, indexed pages.
- Analytics: qualified visits, CTA rate, signup rate, activation rate.
- Write one sentence: **“The biggest bottleneck this week is…”**

### Tuesday — 90 minutes: create

- Draft one useful resource or improve one high-impression page.
- Use a real screenshot, workflow, or customer question.
- Stop after one complete page; do not create five thin drafts.

### Wednesday — 35 minutes: publish and distribute

- Publish the page.
- Write one LinkedIn post from its most useful insight.
- Send it personally to two people who have the problem.

### Thursday — 45 minutes: talk to the market

- Have one customer/bookkeeper conversation, or contact five warm/relevant people.
- Record their exact wording about the problem.
- Do not mass-message scraped email lists. Australian commercial messaging rules require careful consent, sender identification, and unsubscribe handling.

### Friday — 45 minutes: improve conversion

- Watch one session recording or trace one signup path.
- Fix the largest friction point.
- Update the scorecard and next week’s single priority.

Total: about 4 hours.

---

## 9. Founder-led distribution scripts

### LinkedIn launch post

> Small-business owners should not spend Friday afternoon trying to remember which overdue invoice needs another email.
>
> I’m building PaidSoon to make the follow-up process calm and repeatable: see what needs attention, send the right reminder, record promises to pay, and pause the process when there is a dispute.
>
> It does not replace accounting software. It handles the operational gap between “invoice overdue” and “payment received.”
>
> I’m looking for a small number of Australian businesses or bookkeepers willing to show me how they handle this today. Here is the workflow: [tracked link]

### Bookkeeper introduction message

Use this only for people you know, relevant professional connections, or contacts where a business approach is appropriate.

> Hi [Name] — I’m building PaidSoon, a lightweight follow-up layer for Australian businesses that have outgrown basic invoice reminders but do not need enterprise debt-collection software.
>
> It tracks the next action, promises to pay, disputes, and the weekly debtor position, while leaving the accounting system as the source of truth.
>
> I’m trying to understand where the current process breaks for bookkeepers and their clients. Would you be open to a 15-minute walkthrough of how you manage overdue invoices today? This is research, not a sales presentation.

### Customer interview questions

1. Show me what you do when an invoice first becomes overdue.
2. Where do you record the last contact and next action?
3. How do you remember a promise-to-pay date?
4. What happens when the customer disputes the invoice?
5. What do Xero/MYOB reminders handle well, and what remains manual?
6. What would make you distrust an automated follow-up product?
7. What result would make PaidSoon worth $9, $19, or $39 per month?

Do not ask “Would you use this?” Ask about actual invoices, actual actions, and actual time spent.

---

## 10. Bookkeeper partner motion

Do not build a complicated affiliate system initially. Test the relationship manually.

### Initial offer

- Free partner account for the practice.
- Assisted setup for up to three client businesses.
- Direct access to the founder for the beta period.
- Optional co-branded client onboarding guide later.
- A simple referral credit only after partners demonstrate real demand.

### Partner page content

- The client problem PaidSoon solves.
- What it does and does not replace.
- How invoice data enters PaidSoon.
- Who owns the customer relationship.
- Data access, permissions, deletion, and security.
- What the bookkeeper can see and do.
- Clear pricing and support.
- “Join the partner beta” CTA.

### Partner success criterion

A partner is validated when they introduce at least one suitable client who imports real invoices—not when they merely say the idea sounds good.

---

## 11. Paid search: only after the site converts

Paid search is optional. With plans at approximately $9–$39 per month, broad advertising can consume the customer’s first-year gross margin. Organic search, referrals, and bookkeeper distribution should carry most early acquisition.

### Entry gate

Do not run ads until:

- At least 100 qualified non-founder visits have reached the site.
- The primary CTA conversion rate is at least 3%.
- Signup and activation tracking work.
- The landing page represents a live workflow.

### First 14-day test

- Budget: AUD $10–$15 per day.
- Network: Google Search only.
- Location: Australia.
- Schedule: business hours initially.
- Match type: exact and phrase only.
- One tightly matched landing page per intent.

Suggested starting terms to validate in Keyword Planner:

- `invoice reminder software australia`
- `automated overdue invoice reminders`
- `invoice follow up software`
- `accounts receivable software small business`
- `xero overdue invoice follow up`

Initial negative terms:

- jobs
- salary
- wage advance
- payday loan
- invoice generator
- free invoice maker
- debt collector jobs
- personal loan

### Ad test stop rules

Pause a keyword or campaign when any of these is true:

- 30 clicks and no signup starts.
- 100 clicks and no activated account.
- Cost per activated account is above AUD $75 with no evidence of a higher-value plan or strong retention.
- Search terms show consumer debt, lending, employment, or invoice-creation intent.

Do not use LinkedIn ads initially. The audience is useful, but the likely click cost is poorly matched to a $9–$39 subscription.

---

## 12. Scorecard and decision rules

Update this table every Friday. Compare week over week, not hour by hour.

| Metric | This week | Last week | Target | Action if below target |
|---|---:|---:|---:|---|
| Search impressions |  |  | +15% monthly | Publish or improve one high-intent page |
| Organic clicks |  |  | +15% monthly | Improve titles/descriptions on high-impression pages |
| Qualified sessions |  |  | 125/week by day 90 | Increase targeted distribution |
| Primary CTA rate |  |  | 4%+ | Clarify hero, proof, and CTA |
| Signup completion |  |  | 60%+ of starts | Remove form/onboarding friction |
| Activation |  |  | 50%+ of signups | Improve import and first-action flow |
| Trial-to-paid |  |  | 20%+ | Interview non-converters; improve value moment |
| Partner conversations |  |  | 2/month | Contact warm bookkeeper network |
| Activated partner clients |  |  | 1/month | Improve partner offer/onboarding |

### Diagnostic tree

- **No impressions:** indexing, topic selection, or authority problem.
- **Impressions but no clicks:** weak title, description, or intent match.
- **Clicks but no CTA:** weak positioning, proof, or landing-page relevance.
- **CTA but no signup:** signup friction or insufficient trust.
- **Signup but no activation:** product/onboarding problem, not a marketing problem.
- **Activation but no payment:** pricing, retention, or value-realisation problem.

### 90-day go/change/stop review

**Continue** a channel when it produces activated accounts at a sustainable cost or creates a clear upward trend.

**Change** a channel when it creates qualified visits but weak conversion; fix the offer or landing page before abandoning the traffic source.

**Stop** a channel when it repeatedly produces irrelevant visits, no customer learning, and no activated accounts after a fair test.

---

## 13. What not to do

- Do not publish daily generic AI articles.
- Do not buy backlinks, followers, or scraped email lists.
- Do not advertise every planned FinOps feature before PaidSoon has won the invoice follow-up use case.
- Do not use “FinOps” as the primary customer-facing term; many small-business owners will not search for it.
- Do not lead with architecture, AI, or integrations. Lead with less chasing and clearer cash flow.
- Do not run broad paid campaigns before activation tracking works.
- Do not count impressions, likes, or free signups as success without activation.
- Do not hide pricing for a low-cost self-service product.
- Do not compare PaidSoon with Xero or MYOB dishonestly.
- Do not wait for a perfect product before speaking with five real users.

---

## 14. Your first 90 minutes

Start here, in this exact order:

1. Open Google Search Console and create the `paidsoon.com.au` Domain property.
2. Inspect the homepage URL and record the result.
3. Open `/robots.txt` and `/sitemap.xml`; create a ticket for anything missing.
4. Add the seven funnel events to the product backlog.
5. Replace the homepage H1 and subheading with the recommended positioning.
6. Put a real PaidSoon dashboard screenshot directly below the hero.
7. Create a ticket for the first resource: **Overdue Invoice Reminder Email Templates for Australian Small Business**.
8. Book one 15-minute conversation with a business owner or bookkeeper for this week.

At the end of 90 minutes, the work should exist as deployed changes, backlog tickets, or a booked conversation—not as more marketing research.

---

## Sources and market notes

The operating recommendations above are based on the following current market facts and official guidance:

- Xero’s June-quarter 2026 Australian data reported an average 22.9 days to be paid and invoices being paid 6.0 days late, confirming that late payment remains a real small-business problem: <https://www.xero.com/au/resources/small-business-insights/latest-australia/>
- Xero includes configurable invoice reminders, so PaidSoon must sell a broader follow-up workflow rather than claim that accounting software does not automate reminders: <https://central.xero.com/s/article/Turn-invoice-reminders-on-or-off>
- MYOB now promotes smart reminders, selectable tones, suggested actions, customer payment behaviour, and up to five reminders: <https://www.myob.com/au/support/myob-business/sales/online-invoicing/send-smart-invoice-reminders>
- Google recommends crawlable links, useful server-visible content, a sitemap, Search Console inspection, and helpful people-first content: <https://developers.google.com/search/docs/fundamentals/get-started-developers>, <https://developers.google.com/search/docs/fundamentals/creating-helpful-content>, and <https://support.google.com/webmasters/answer/10351509>
- Current specialist results include narrow manual-reminder and automated-follow-up products, reinforcing the need for specific differentiation: <https://paynudge.com.au/> and <https://brindlehq.com/>

Review competitor claims and product capabilities quarterly. Do not copy their wording; use them only to keep PaidSoon’s positioning accurate.


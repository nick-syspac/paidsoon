// Synthetic actual React workspace/settings. Transport only is mocked: no
// Next server, database, provider calls, auth session or real customer data.
import { build } from "esbuild"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "synthetic-router", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "synthetic-router", namespace: "synthetic" }))
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({ contents: 'export const useRouter = () => ({ refresh: () => { globalThis.syntheticRefreshes = (globalThis.syntheticRefreshes || 0) + 1 } });' }))
  } }],
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { CommitGuardWorkspace } from "@/components/dashboard/commitguard/CommitGuardWorkspace";
    import { CommitGuardSettingsClient } from "@/components/settings/CommitGuardSettingsClient";
    import { CandidatePatchSchema } from "@/lib/commitguard/candidatePresentation";
    let settings = {enabled: true, detectRecurringCommitments: true, detectionConfidenceThreshold: "medium",
      defaultHorizonDays: 30, safetyBufferMode: "fixed_amount", safetyBufferFixedCents: 0,
      safetyBufferPercent: null, safetyBufferWeeks: null, detectionMinOccurrences: 3,
      detectionAmountVariancePercent: 12, detectionIntervalToleranceDays: 3,
      alertCommitmentDueSoon: true, alertRenewalApproaching: true, alertNoticePeriodApproaching: true,
      alertCommitmentAmountChanged: true, alertCommitmentBufferLow: true, alertCommitmentShortfall: true, renewalWarningDays: [7, 30]};
    let candidates = [{id: "candidate-1", name: "Synthetic software", category: "software", frequency: "monthly",
      typicalAmountCents: 12345, currency: "usd", confidence: "medium", source: "accounting_integration",
      supplierName: "Synthetic supplier", status: "pending", suggestedDueDate: "2026-10-31",
      latestObservedAt: "2026-09-30", recurrenceAnchor: "2026-01-31", evidenceReviewRequired: true,
      evidence: {sampleCount: 3, sourceKind: "bill", observations: [{sourceId: "synthetic-bill-1", date: "2026-09-30", amountCents: 12345, currency: "usd"}]}}];
    const writes = []; let failReload = false;
    const controls = document.getElementById("scenario");
    globalThis.fetch = async (url, init) => {
      const mode = controls.value;
      if (url === "/api/commitguard/settings") {
        if (init?.method === "PUT") { settings = {...settings, ...JSON.parse(init.body)}; return Response.json({settings}); }
        const policy = {...settings, enabled: mode !== "disabled", detectRecurringCommitments: mode !== "optout",
          detectionConfidenceThreshold: mode === "legacy" ? "confirmed" : settings.detectionConfidenceThreshold};
        return Response.json({settings: policy});
      }
      if (url === "/api/commitguard/detections" && init?.method === "POST") {
        writes.push("detect"); document.getElementById("writes").textContent = JSON.stringify(writes);
        if (mode === "detect-conflict") return Response.json({error: "Recurring commitment detection is disabled", code: "detection_disabled"}, {status: 409});
        if (mode === "denied") return Response.json({error: "Upgrade required"}, {status: 403});
        if (mode === "server-error") return Response.json({error: "Internal server error"}, {status: 500});
        return Response.json({detection: {created: 0, updated: 1, skipped: 2, warnings: ["potential_duplicate_streams"]}, candidates});
      }
      if (url === "/api/commitguard/detections") {
        if (failReload) { failReload = false; return Response.json({error: "Synthetic reload failure"}, {status: 500}); }
        return Response.json({candidates});
      }
      if (url.includes("/review")) {
        const payload = JSON.parse(init.body); writes.push(payload);
        document.getElementById("writes").textContent = JSON.stringify(writes);
        if (mode === "converted-conflict") return Response.json({error: "Candidate already converted; use the existing commitment", reason: "candidate_already_converted", commitmentId: "existing-1"}, {status: 409});
        if (mode === "legacy-conflict") return Response.json({error: "Conversion requires review", reason: "conversion_review_required"}, {status: 409});
        if (mode === "validation") return Response.json({error: {fieldErrors: {patch: ["Synthetic route field validation"]}}}, {status: 400});
        const candidate = candidates[0];
        if (payload.action === "edit") {
          const parsed = CandidatePatchSchema.safeParse(payload.patch);
          if (!parsed.success) return Response.json({error: parsed.error.flatten()}, {status: 400});
          Object.assign(candidate, parsed.data, {status: "pending", evidenceReviewRequired: false});
        } else candidate.status = payload.action === "confirm" ? "converted" : payload.action === "ignore" ? "ignored" : "not_a_commitment";
        if (mode === "reload-failure") failReload = true;
        return Response.json({status: "updated", ...(payload.action === "confirm" ? {commitmentId: "existing-1"} : {})});
      }
      if (url === "/api/commitguard/commitments") return Response.json({commitments: []});
      throw new Error("Unexpected synthetic transport request " + url);
    };
    createRoot(document.getElementById("root")).render(createElement(CommitGuardWorkspace, {
      initialCommitments: [], initialDetectedCandidates: candidates.map(c => ({...c})), detectionEnabled: true,
      detectionSettings: settings
    }));
    createRoot(document.getElementById("settings")).render(createElement(CommitGuardSettingsClient, {
      settings: {...settings, detectionConfidenceThreshold: "confirmed"}
    }));
  ` },
})
const server = createServer((request, response) => {
  if (request.url === "/component.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents)
    return
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic candidate acceptance</title><style>body{font:16px system-ui; margin:12px} input,select,button{max-width:100%;box-sizing:border-box} main,section,article,form{min-width:0} p,output{overflow-wrap:anywhere}button{margin:4px}label{display:block;margin:8px 0}</style></head><body><h1>SYNTHETIC ONLY — no real API/database</h1><label for="scenario">Synthetic transport scenario</label><select id="scenario">${["success", "disabled", "optout", "legacy", "detect-conflict", "denied", "server-error", "converted-conflict", "legacy-conflict", "validation", "reload-failure"].map(mode => `<option>${mode}</option>`).join("")}</select><output id="writes" aria-label="Synthetic writes">[]</output><main id="root"></main><section id="settings" aria-label="Synthetic settings"></section><script type="module" src="/component.js"></script></body></html>`)
})
server.listen(4185, "127.0.0.1", () => console.log("Synthetic candidate acceptance: http://127.0.0.1:4185"))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))
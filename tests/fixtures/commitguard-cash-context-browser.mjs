// Synthetic component-only browser harness. No Next server, auth, env, DB or APIs.
// esbuild is already present through tsx; the bundle is served from memory.
import { build } from "esbuild"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../", import.meta.url))
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  stdin: { resolveDir: root, loader: "tsx", contents: `
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { CommitGuardCashContextForm } from "@/components/dashboard/commitguard/CommitGuardCashContextForm";
    const scenario = new URLSearchParams(location.search).get("scenario");
    let context = {amountCents: 0, currency: "aud", balanceAsOf: "2026-10-11", weeklyOperatingExpensesCents: null,
      weeklyExpensesCurrency: null, weeklyExpensesAsOf: null, taxProtectionCurrency: null, revision: 1,
      asOf: "2026-10-19", source: "owner_entered", freshness: "stale", weeklyExpensesFreshness: "missing"};
    let puts = 0, gets = 0, refreshes = 0;
    function counts() { document.getElementById("counts").textContent = JSON.stringify({puts, gets, refreshes}); }
    const request = async (_url, init) => {
      if (init?.method === "PUT") {
        puts++;
        const input = JSON.parse(init.body);
        if (scenario === "conflict" && puts === 1) {
          context = {...context, amountCents: 12345, revision: 2}; counts(); return new Response(null, {status: 409});
        }
        if (input.expectedRevision !== context.revision) { counts(); return new Response(null, {status: 409}); }
        const {expectedRevision, ...fields} = input;
        context = {...context, ...fields, revision: context.revision + 1,
          freshness: fields.balanceAsOf ? "fresh" : "missing", weeklyExpensesFreshness: fields.weeklyExpensesAsOf ? "fresh" : "missing"};
      } else {
        gets++;
        if (scenario === "refresh-failure" && gets === 1) { counts(); return new Response(null, {status: 503}); }
      }
      counts(); return Response.json({cashContext: context});
    };
    counts();
    createRoot(document.getElementById("root")).render(createElement(CommitGuardCashContextForm, {
      initialContext: context, request, onRefresh: () => { refreshes++; counts(); }
    }));
  ` },
})
const server = createServer((request, response) => {
  if (request.url === "/component.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents)
    return
  }
  response.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic CommitGuard cash form</title><style>body{font-family:system-ui;margin:16px;max-width:960px}input,select{display:block;box-sizing:border-box;max-width:100%;padding:8px}button{padding:10px;margin:4px;max-width:100%;white-space:normal}fieldset{min-width:0;margin-block:18px}p,dd{overflow-wrap:anywhere}dt,dd{margin:0}svg{width:16px}</style></head><body><p>SYNTHETIC COMPONENT ONLY — no authentication, database or real API.</p><output id="counts" aria-label="Synthetic request counts"></output><main id="root"></main><script type="module" src="/component.js"></script></body></html>`)
})
server.listen(4179, "127.0.0.1", () => console.log("Synthetic form: http://127.0.0.1:4179 — fixture data only"))
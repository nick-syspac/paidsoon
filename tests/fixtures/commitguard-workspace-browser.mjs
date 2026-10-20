// Actual complete workspace/settings React renderers, synthetic transport only.
// No Next server, authentication provider, database or external API is used.
import { build } from "esbuild"
import { createServer } from "node:http"
import { fileURLToPath } from "node:url"
import { readFile } from "node:fs/promises"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const root = fileURLToPath(new URL("../../", import.meta.url))
const stylesheet = await postcss([tailwind()]).process(await readFile(`${root}/app/globals.css`, "utf8"), { from: `${root}/app/globals.css` })
const bundle = await build({ absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "synthetic-next", setup(builder) {
    builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "synthetic" }))
    builder.onLoad({ filter: /router/, namespace: "synthetic" }, () => ({ contents: 'export const useRouter=()=>({refresh:()=>{globalThis.refreshes=(globalThis.refreshes||0)+1;globalThis.synthetic?.refreshSettings?.();globalThis.synthetic?.refreshServer?.()}})' }))
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "synthetic" }))
    builder.onLoad({ filter: /link/, namespace: "synthetic" }, () => ({ contents: 'import React from "react"; export default function Link(props){return React.createElement("a",props)}', resolveDir: root }))
  } }],
  stdin: { loader: "tsx", resolveDir: root, contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {CommitGuardDashboard} from "@/components/dashboard/commitguard/CommitGuardDashboard";
    import {CommitGuardSettingsClient} from "@/components/settings/CommitGuardSettingsClient";
    import {CommitGuardSettingsTransferClient} from "@/components/settings/CommitGuardSettingsTransferClient";
    import {syntheticWorkspace, workspaceNow, workspaceCommitment} from "@/tests/helpers/commitGuardWorkspace";
    import {buildCommitGuardSummary} from "@/lib/commitguard/summary";
    import {CommitGuardSettingsSchema} from "@/lib/commitguard/settingsSchema";
    import {CommitGuardSettingsImportSchema} from "@/lib/commitguard/settingsTransfer";
    import {toCommitGuardCashContextDto} from "@/lib/commitguard/cashContext";
    import {selectWorkspaceCommitments,WorkspaceQuerySchema} from "@/lib/commitguard/workspaceFilters";
    let state=syntheticWorkspace(); let writes=[]; let gets=0; let failNext=false; let failCashNext=false;
    let deferRead=false;let releaseRead;let deferWrite=false;let releaseWrite;
    const dashboardRoot=createRoot(document.getElementById("root"));
    const settingsRoot=createRoot(document.getElementById("settings"));
    const refreshSettings=()=>settingsRoot.render(<CommitGuardSettingsClient settings={structuredClone(state.settings)}/>);
    const params=WorkspaceQuerySchema.parse(Object.fromEntries(new URLSearchParams(location.search)));
    if(location.pathname.includes("filters")||params.source==="import")state.commitments=Array.from({length:31},(_,i)=>({...state.commitments[0],
      id:"synthetic-"+String(i).padStart(2,"0"),name:"Synthetic record "+String(i).padStart(2,"0"),
      category:i<6?"insurance":"software",amountCents:1000+i,source:"import",essentiality:"essential",
      linkedCostGuardAlertId:"legacy-alert",linkedSpendInsightId:"insight-1"}));
    if(location.pathname.includes("renewals")||params.renewalPage)state.commitments=Array.from({length:19},(_,i)=>({...state.commitments[0],
      id:"renewal-"+String(i).padStart(2,"0"),name:"Synthetic renewal "+String(i).padStart(2,"0"),
      currency:i===1?"usd":"aud",frequency:i===2?"custom":i===3?"one_off":"monthly",
      renewalDate:"2026-11-01T00:00:00.000Z",noticePeriodDays:i===0?30:7,
      status:i===17?"cancelled":i===18?"expired":"active"}));
    const renderServer=(snapshot)=>dashboardRoot.render(<CommitGuardDashboard initial={structuredClone(snapshot)} params={params}/>);
    const mode=()=>document.getElementById("scenario").value;
    function candidate(){return {id:"candidate-1",name:"Synthetic detected",category:"software",frequency:"monthly",typicalAmountCents:2000,currency:"aud",source:"import",confidence:"medium",status:"pending",evidence:{},supplierName:null,suggestedDueDate:"2026-10-21",latestObservedAt:null,recurrenceAnchor:null}}
    state.candidates=[candidate()];state.reviewCount=1;
    function recalculate(){
      state.cashContext=toCommitGuardCashContextDto({...state.cashContext,
        balanceAsOf:state.cashContext.balanceAsOf?new Date(state.cashContext.balanceAsOf):null,
        weeklyExpensesAsOf:state.cashContext.weeklyExpensesAsOf?new Date(state.cashContext.weeklyExpensesAsOf):null},workspaceNow);
      state.summary=buildCommitGuardSummary({settings:state.settings,calculationRevision:state.calculationRevision,
        cashContext:state.cashContext,now:workspaceNow,commitments:state.commitments.map(row=>({...workspaceCommitment,...row,
          nextDueDate:row.nextDueDate?new Date(row.nextDueDate):null,startDate:row.startDate?new Date(row.startDate):null,
          endDate:row.endDate?new Date(row.endDate):null,renewalDate:row.renewalDate?new Date(row.renewalDate):null,updatedAt:workspaceNow})),
        tax:{asOf:workspaceNow.toISOString(),applicable:false,amountCents:0,currency:null,categories:[],quality:{state:"not_applicable",reasons:["not_applicable"]}},
        coverage:{sources:{userId:"synthetic",taxApplicable:false,commitments:[],bills:[],taxCategories:[]},rows:[]}});
      state.cashInputRevision=state.cashContext.revision;state.reviewCount=state.candidates.filter(c=>c.status==="pending").length;
      state.upcoming=selectWorkspaceCommitments(state.commitments,params,state.asOf);
    }
    globalThis.synthetic={get state(){return structuredClone(state)},get writes(){return [...writes]},get gets(){return gets},
      fail:()=>{failNext=true},failCash:()=>{failCashNext=true},renderServer,refreshSettings,refreshServer:()=>renderServer(state),
      holdRead:()=>{deferRead=true},releaseRead:()=>releaseRead?.(),holdWrite:()=>{deferWrite=true},releaseWrite:()=>releaseWrite?.()};
    globalThis.fetch=async(url,init)=>{
      const method=init?.method||"GET";const body=init?.body?JSON.parse(init.body):{};
      if(method==="GET"){
        gets++;
        if(url.startsWith("/api/commitguard/workspace")){
          if(failNext){failNext=false;return new Response(null,{status:500})}
          const snapshot=structuredClone(state);
          snapshot.upcoming=selectWorkspaceCommitments(snapshot.commitments,WorkspaceQuerySchema.parse(Object.fromEntries(new URL(url,location.origin).searchParams)),snapshot.asOf);
          if(deferRead){deferRead=false;await new Promise(resolve=>{releaseRead=resolve})}
          return Response.json({workspace:snapshot});
        }
        if(url==="/api/commitguard/cash-context"){if(failCashNext){failCashNext=false;return new Response(null,{status:500})}return Response.json({cashContext:state.cashContext})}
        if(url==="/api/commitguard/settings")return Response.json({settings:state.settings});
        throw Error("Unexpected GET "+url)
      }
      writes.push({url,method,body});
      if(deferWrite){deferWrite=false;await new Promise(resolve=>{releaseWrite=resolve})}
      if(mode()==="conflict")return Response.json({error:"Changed elsewhere (409). Reload current saved state."},{status:409});
      if(url==="/api/commitguard/settings"){
        if(mode()==="validation")return Response.json({error:{fieldErrors:{renewalWarningDays:["Synthetic server field error; draft retained."]}}},{status:400});
        const schema=init?.headers?.["X-CommitGuard-Settings-Transfer"]==="import"?CommitGuardSettingsImportSchema:CommitGuardSettingsSchema;
        const parsed=schema.safeParse(body);
        if(!parsed.success)return Response.json({error:parsed.error.flatten()},{status:400});
        Object.assign(body,parsed.data);
      }
      if(mode()==="validation"&&url.includes("/commitments/"))return Response.json({error:{fieldErrors:{renewalDate:["Enter a valid renewal date."],noticePeriodDays:["Enter a whole number from 0 to 365."]}}},{status:400});
      state.calculationRevision++;
      if(url==="/api/commitguard/commitments")state.commitments.push({...state.commitments[0],...body,id:"manual-"+writes.length,updatedAt:workspaceNow.toISOString()});
      else if(url.includes("/actions")){const row=state.commitments.find(c=>url.includes(c.id));if(row){if(body.action==="confirm")row.confidence="confirmed";else row.status=({pause:"paused",resume:"active",cancel:"cancelled"})[body.action]}}
      else if(url.includes("/commitments/")){const row=state.commitments.find(c=>url.includes(c.id));if(row)Object.assign(row,body)}
      else if(url.includes("/review")){const c=state.candidates.find(c=>url.includes(c.id));if(body.action==="edit")Object.assign(c,body.patch);else if(body.action==="confirm"){c.status="converted";state.commitments.push({...state.commitments[0],id:"converted-"+writes.length,name:c.name,amountCents:c.typicalAmountCents})}else c.status=body.action;}
      else if(url==="/api/commitguard/detections"){state.candidates.push({...candidate(),id:"candidate-"+writes.length})}
      else if(url==="/api/commitguard/settings")Object.assign(state.settings,body);
      else if(url==="/api/commitguard/cash-context"){Object.assign(state.cashContext,body,{revision:state.cashContext.revision+1});delete state.cashContext.expectedRevision;}
      recalculate();if(mode()==="refresh-failure")failNext=true;
      if(url==="/api/commitguard/cash-context")return Response.json({cashContext:state.cashContext});
      if(url==="/api/commitguard/detections")return Response.json({detection:{created:1,updated:0,skipped:0},candidates:state.candidates});
      return Response.json({settings:state.settings,status:"updated"});
    };
    recalculate();
    renderServer(state);
    refreshSettings();
    createRoot(document.getElementById("transfer")).render(<CommitGuardSettingsTransferClient/>);
  ` },
})
const server = createServer((request, response) => {
  if (request.url === "/component.js") return response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle.outputFiles[0].contents)
  if (request.url === "/styles.css") return response.writeHead(200, { "Content-Type": "text/css" }).end(stylesheet.css)
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic coherent workspace acceptance</title><link rel="stylesheet" href="/styles.css"><style>body{font:16px system-ui;margin:12px}</style></head><body><h1>SYNTHETIC ONLY — no external DB/API</h1><label>Transport scenario<select id="scenario"><option>success</option><option>refresh-failure</option><option>conflict</option><option>validation</option></select></label><main id="root"></main><section id="settings" aria-label="Synthetic settings"></section><section id="transfer"></section><script type="module" src="/component.js"></script></body></html>`)
})
const port = Number(process.env.PORT ?? 4186)
server.listen(port, "127.0.0.1", () => console.log(`Synthetic coherent workspace: http://127.0.0.1:${port}`))
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)))